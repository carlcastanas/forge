# Team adoption

How to roll FORGE out across a team without producing a configuration nobody owns and a review process nobody trusts. This page covers pilot scope, choosing the shared rule set, the shared-versus-personal split, what changes in code review, what belongs in CI, how to tell whether it helped, and the organizational failures that show up most often.

Prerequisites:

- You have used FORGE yourself on real work for at least a week.
- You can answer "what does it do" without reading a page. See [CONCEPTS.md](CONCEPTS.md).
- You know which harnesses your team actually uses. See [HARNESS-MATRIX.md](HARNESS-MATRIX.md).

## The shape of a rollout

| Phase | Duration | Who | Exit criterion |
|---|---|---|---|
| Pilot | 2-4 weeks | 2-3 volunteers | A written recommendation with evidence, either way |
| Shared baseline | 1-2 weeks | Pilot group plus one reviewer | A committed `forge-install.json` and a rule set under 400 lines |
| Opt-in rollout | 4-8 weeks | Anyone who wants it | Half the team using it voluntarily, or a decision to stop |
| Default | ongoing | Everyone | Onboarding docs assume it; a named owner maintains it |

Do not skip to the last row. A mandated harness that nobody piloted produces compliance, not adoption, and compliance produces the anti-patterns in [ANTI-PATTERNS.md](ANTI-PATTERNS.md) faster than anything else.

## Pilot scope

### Pick the right people

Two or three engineers who already work on the same part of the codebase. Not the most enthusiastic — the most representative. An early-adopter pilot tells you what enthusiasts can make work, which is not the question.

### Pick the right work

The pilot needs tasks where you can tell whether the output was good:

| Good pilot work | Bad pilot work |
|---|---|
| Bug fixes with a reproducible failure | Greenfield exploration |
| Well-specified features in a known area | Anything with contested requirements |
| Test coverage on an under-tested module | A rewrite |
| Onboarding a new person to a subsystem | Production incident response |

The common mistake is piloting on the hardest problem in the backlog, on the theory that the tool should prove itself. It will not, and you will learn nothing about the normal case.

### Start narrow

```bash
forge plan --profile developer --target claude-project --json
forge install --target claude-project --profile developer
```

Not `--profile full`. The pilot's job includes finding out which capability components you actually need. Add them one at a time, when a real task demands one:

```bash
forge install --target claude-project --profile developer --with capability:security
```

Start on `FORGE_HOOK_PROFILE=standard`. `strict` adds workflow policing that a team has not yet agreed to, and `minimal` hides the quality gates you are trying to evaluate.

### Write the pilot down

Before starting, write one page: what you are measuring, what result would make you adopt, what result would make you stop. After, write the recommendation. A pilot that ends in "it was fine, let's keep going" was not a pilot.

## Choosing the rule set

Rules are the highest-leverage and highest-cost surface. They are injected wholesale on every path match, so their length is a recurring tax on every session everyone runs.

### What belongs in a shared rule

| Belongs | Does not belong |
|---|---|
| Invariants that hold every time, with no judgment | Playbooks and workflows |
| Safety floors and permission constraints | Historical context and rationale essays |
| Repository conventions the team argued about once and settled | Individual preference |
| Path-scoped constraints (`api/**` must validate input) | Anything true of software generally |

If it needs judgment, it is a skill. If it must be enforced rather than suggested, it is a hook. If it is history, it is an architecture decision record. The routing decision is in [capability-surface-selection.md](capability-surface-selection.md).

### Getting the set right

1. Start with the shipped baseline (`baseline:rules` via your profile) and nothing local.
2. For four weeks, log every correction someone types twice. That log is the candidate list.
3. For each candidate, apply the routing test. Most of them will turn out to be skills.
4. Add the survivors as rules, one per pull request, with the same review bar as code.
5. Set a length budget per rule file and enforce it. The `rules-distill` skill compresses an overgrown set.

### Give it an owner

One named person reviews rule changes and prunes quarterly. A rule set without a pruning owner only grows, and every line is charged to every session. This is the single most common cause of "FORGE made everything slower."

Depth: [RULES-GUIDE.md](RULES-GUIDE.md).

## Shared versus personal skills

Keep two tiers and keep them separate.

| | Shared | Personal |
|---|---|---|
| Lives in | The repository, committed | Your own skills directory |
| Contains | Team decisions, domain playbooks, review standards | Individual workflow, scratch tooling, experiments |
| Reviewed | Yes, like code | No |
| Changed by | Pull request | Whenever you like |

The policy FORGE itself follows: curated skills live in `skills/`; generated or user-imported skills belong in the user's own skills directory. See [SKILL-PLACEMENT-POLICY.md](SKILL-PLACEMENT-POLICY.md).

The failure this prevents is a shared catalog that accumulates one person's habits. A team reviewing someone's preferred git aliases as a shared skill has lost the thread, and the reviewers will start rubber-stamping — which is worse, because the next thing through is a real domain playbook nobody read.

### Promoting a personal skill to shared

Require three things:

1. It has been used on real work by its author, repeatedly.
2. A second person used it and it worked for them too.
3. It passes the authoring contract: specific `description`, a "when to use" section, examples that were run.

Then it goes through review like any change. `/promote` and the `skill-comply` skill support this path. Search before adding — no skill should duplicate an existing one:

```bash
rg -n "When to use|Use when|Trigger" skills -g 'SKILL.md'
```

### Pruning

Quarterly, run the audit and delete what does not fire:

```bash
/skill-health
forge session-inspect skills:health
```

Skills with zero activations in a quarter come out. This is not housekeeping — a large catalog makes skill selection worse for everything else in it. See [ANTI-PATTERNS.md](ANTI-PATTERNS.md#skill-sprawl).

## Code review when agents write code

The diff is the same. What changed is where the errors cluster and how fast they arrive.

### Non-negotiables

**Every change has a human owner.** The person who ran the agent is the author, with the same accountability as if they had typed it. "The agent wrote it" is not a review response.

**No unverified tests.** This is the highest-severity item. A test that has never failed has not been verified to test anything. In review, ask: revert the implementation — does the suite go red on the tests that should care? Would this test pass with the function body deleted? Is it asserting against behavior or against a mock the same change introduced? See [ANTI-PATTERNS.md](ANTI-PATTERNS.md#unverified-generated-tests).

**A model review is not a review.** `/code-review` and the reviewer agents generate hypotheses. Findings become work only after a reproduction. A clean model review is not a merge signal — it means the reviewer did not find anything. See [ANTI-PATTERNS.md](ANTI-PATTERNS.md#treating-review-output-as-truth).

**Volume gets a budget.** Agents make large diffs cheap. Set a size limit on reviewable PRs and hold it. A 2,000-line agent-generated PR does not get reviewed; it gets approved.

### A workable checklist

| Check | Question |
|---|---|
| Ownership | Can the author explain every hunk without re-reading it? |
| Test reality | Has each new test been observed failing? |
| Scope | Does the diff do only what the description says? |
| Suppression | Any new ignore comments, widened types, or disabled lint rules? |
| Config | Did anything touch linter, formatter, or CI config? |
| Verification | Is there evidence the change ran, not just compiled? |
| Dependencies | Any new dependency, and was it justified? |

FORGE ships hooks for several of these. `pre:config-protection` blocks modifications to linter and formatter config and steers toward fixing the code instead. `pre:bash:block-no-verify` runs in every profile, including `minimal`, so `--no-verify` is not a shortcut anyone has.

### Review lanes

Splitting the review beats one undifferentiated pass. The lanes the repository uses are scope, tests, security, install surface, cross-harness, and docs. Map them to agents:

```text
agent: code-reviewer          # quality and maintainability
agent: security-reviewer      # secrets, injection, SSRF, unsafe crypto
agent: pr-test-analyzer       # do the tests test the change
agent: <stack>-reviewer       # language-specific correctness
/security-scan                # Forge Shield over agent, hook, MCP, permission, secret surfaces
```

Routing by file type is in [../AGENTS.md](../AGENTS.md). The full sequence is recipe 4 in [RECIPES.md](RECIPES.md#4-review-a-pull-request).

## CI integration

Two distinct questions: does CI check FORGE's own configuration, and does CI run agents. Answer the first yes and the second carefully.

### Checking the configuration

These have real exit codes and belong in CI on any repository with a committed FORGE setup.

```bash
# Configuration drift and install health
forge doctor --json
forge list-installed --json
forge status --exit-code            # 2 when readiness needs attention

# Supply-chain surface
forge security-ioc-scan --json

# Repository hygiene, if you maintain FORGE content
npm test
npm run lint
npm run catalog:check
npm run command-registry:check
npm run harness:adapters
npm run platform:audit -- --exit-code
```

| Exit code | Meaning |
|---|---|
| 0 | Pass |
| 1 | Error |
| 2 | Attention needed (`forge status`, `forge loop-status`, `forge platform-audit` with `--exit-code`) |

A minimal gate:

```yaml
- name: FORGE configuration check
  run: |
    npx --yes forge-universal doctor --json
    npx --yes forge-universal status --exit-code
```

Pin the version rather than tracking latest, so a release does not change your gate without a commit.

### Running agents in CI

Possible, and mostly not worth it early. The considerations:

- **Cost.** A per-PR agent run multiplies by PR volume. Meter it before enabling it.
- **Nondeterminism.** A gate that fails differently on identical input erodes trust in the whole pipeline. Advisory comments, not blocking checks, until you have data.
- **Secrets.** An agent in CI has whatever the runner has. Scope the token.
- **Injection surface.** PR bodies, issue text, and dependency metadata are untrusted input. An agent reading them in CI is reading attacker-controlled text with repository credentials in scope. See [THREAT-MODEL.md](THREAT-MODEL.md).

If you do it: read-only tools, a bounded scope, output as a comment, and a human deciding what to act on.

### Committing the setup

Commit `forge-install.json` so everyone resolves the same content:

```json
{
  "$schema": "./schemas/forge-install-config.schema.json",
  "version": 1,
  "target": "claude-project",
  "profile": "developer",
  "include": ["capability:security"]
}
```

Install at project scope for shared configuration, or local scope when someone wants FORGE enabled without committing the choice:

```bash
forge setup --mode claude-plugin --scope project --hooks standard --yes
forge setup --mode claude-plugin --scope local --hooks standard --yes
```

Do not commit `.env`. Note also that the FORGE repository's own validators reject absolute home-directory paths in tracked files — a good rule to copy.

## Measuring whether it helped

Decide the measure before the pilot. A measure chosen afterward will confirm whatever happened.

### Measures that survive scrutiny

| Measure | How to get it | Why it works |
|---|---|---|
| Time from task start to merged, verified change | Issue tracker timestamps | Captures the whole loop, including review |
| Escaped defects per release | Existing incident data | The thing you actually care about |
| Review cycles per PR | Review tool history | Agent-written code that needs four rounds is not faster |
| Time to first useful PR on an unfamiliar subsystem | Onboarding cohort | Where a harness helps most, and easy to observe |
| Test coverage delta on changed lines | `/test-coverage`, CI coverage | Only meaningful alongside the verification check |
| Proportion of shared skills with recorded activations | `/skill-health`, `forge session-inspect skills:health` | Tells you whether the catalog is real |
| Spend per merged change | `/cost-report`, `skill: cost-tracking` | The denominator is what matters |

### Measures that mislead

| Do not measure | Why |
|---|---|
| Lines of code changed | Agents make output cheap; output stops being evidence |
| Number of tests written | Test count is not test quality; see the review section |
| Skills or agents added | Catalog size is a cost, not an achievement |
| Sessions run | Activity, not outcome |
| Findings raised by review | Findings without reproductions are noise |
| Self-reported productivity | Novelty inflates it for about six weeks |

See [ANTI-PATTERNS.md](ANTI-PATTERNS.md#counting-output-as-progress).

### Getting a baseline

You need four to six weeks of before-data on whichever measures you chose. If you do not have it, the pilot cannot answer the question — run the baseline first, or accept that the outcome is a judgment call and say so.

### Watching for the six-week dip

Adoption curves for tools like this commonly show an early spike from novelty, then a dip when the first bad output lands and trust corrects, then a slower real climb. Do not evaluate at week two and do not abandon at week six. Evaluate at the point you wrote down in advance.

Depth: [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md), [../guides/the-evaluation-guide.md](../guides/the-evaluation-guide.md).

## Organizational failure modes

### Mandating before piloting

**Looks like.** A leadership decision that everyone will use it, with a deadline, before anyone has tried it on this codebase.

**Why it fails.** You get compliance behavior: the profile installed and ignored, sessions run to satisfy a metric, and no feedback loop, because reporting that it did not help now reads as non-compliance. You have also lost the pilot's real output, which is knowing which parts to keep.

**Fix.** Pilot, then opt-in, then default. Make the pilot's recommendation genuinely able to be negative.

### No named owner

**Looks like.** The shared rule set, the skill catalog, and the install profile all belong to whoever set them up six months ago and has since moved teams.

**Why it fails.** Every one of these surfaces has a cost that grows without pruning. Rules charge every session. Skills degrade selection. Disabled-hook lists accumulate. Without an owner, nothing is ever removed, only added.

**Fix.** One named owner with a quarterly review on the calendar. Rotate it, but never leave it empty. Their job is deletion at least as much as addition.

### Trusting the output because it is confident

**Looks like.** Review findings become tickets without reproduction. A clean review merges a PR. Agent-written tests are counted rather than checked.

**Why it fails.** Fluency is not accuracy, and the failure is silent. The team learns to trust the surface, and the first serious escaped defect costs more credibility than the tool ever saved.

**Fix.** Reproduction required for findings. Red-before-green required for tests. A human required for merge. Say it out loud in the review guidelines rather than assuming.

### Letting each person configure their own

**Looks like.** Five engineers, five hook profiles, three install profiles, and a bug that reproduces for two of them.

**Why it fails.** Divergent harness configuration turns environment differences into review noise. The reviewer cannot tell whether a change is a preference or a defect.

**Fix.** Shared configuration is committed and reviewed. Personal configuration is explicitly personal and stays out of shared paths. Local scope exists for the middle case. Document which is which.

### Treating the harness as the process

**Looks like.** Design review gets skipped because "the planner covers it." Pairing stops. Nobody reads the code because the reviewer agent did.

**Why it fails.** FORGE supplies the engineering process the model does not bring on its own. It does not supply the engineering judgment your team brings. Removing human steps because a tool nominally covers them removes the only part of the loop that catches the tool being wrong.

**Fix.** Add the harness to the process; do not subtract from it. Revisit after two quarters and remove human steps only where you have evidence the tool covers them.

### Scaling the catalog instead of the practice

**Looks like.** Adoption is measured by skills added. Every team ships a skill pack. Nobody can find the right one.

**Why it fails.** Every added skill makes selection harder for every other skill. A catalog that grows faster than it is used is a net negative, and the effect is invisible until people stop trusting activation.

**Fix.** Measure activations, not additions. Require evidence of repeated real use before promoting a skill to shared. Prune on a schedule.

### Ignoring the harness as an attack surface

**Looks like.** Agent definitions with broad tool allowlists, MCP servers added without review, no scanning of hook or permission configuration.

**Why it fails.** Agent configuration is executable policy. A prompt-injected page read by an agent with shell access is a different severity of incident than the same page read by a read-only reviewer. Skill and MCP additions are supply chain.

**Fix.** Review agent tool allowlists like permissions, because they are permissions. Run `/security-scan` and `forge security-ioc-scan --home` on a schedule. Treat every MCP server addition as a dependency addition. See [THREAT-MODEL.md](THREAT-MODEL.md) and [MCP-CONNECTOR-POLICY.md](MCP-CONNECTOR-POLICY.md).

## A first-90-days checklist

| Week | Do |
|---|---|
| 0 | Write the pilot page: measures, adopt criterion, stop criterion. Collect baseline data. |
| 1 | Two or three engineers install `--profile developer` at project scope, `standard` hooks. |
| 1-4 | Real work only. Log every repeated correction. No new shared skills yet. |
| 4 | Pilot recommendation, written, with evidence. Stop here if the answer is no. |
| 5-6 | Turn the correction log into rules, skills, or hooks by the routing test. Commit `forge-install.json`. Name an owner. |
| 6 | Add the CI configuration check. Update the review guidelines for agent-written code. |
| 7-12 | Opt-in rollout. Office hours, not mandates. Track activations and cost per merged change. |
| 12 | Evaluate against the criteria written in week 0. Prune the catalog. Decide on default. |

## Related pages

- [INSTALLATION.md](INSTALLATION.md) — project versus local scope, and what each writes
- [CONFIGURATION.md](CONFIGURATION.md) — shared configuration surface and precedence
- [ANTI-PATTERNS.md](ANTI-PATTERNS.md) — the individual versions of these failures
- [RECIPES.md](RECIPES.md) — the sequences to teach in onboarding
- [EVALUATION-GUIDE.md](EVALUATION-GUIDE.md) — measuring agent and skill quality
- [THREAT-MODEL.md](THREAT-MODEL.md) — the harness as an attack surface
- [../guides/the-migration-guide.md](../guides/the-migration-guide.md) — adopting FORGE in an existing repository
