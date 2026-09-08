---
name: threat-modeling
description: Structured, defensive threat modeling — scope a system, draw trust boundaries on a data-flow diagram, enumerate threats with STRIDE and attack trees, rank by exploitability and impact, and convert findings into tracked engineering work. Use when the user asks to threat model a feature, identify attack surface, run a security design review, or decide what to harden first.
metadata:
  origin: FORGE
---

# Threat Modeling

A threat model is a design artifact answering four questions: what is being built, what
can go wrong, what will be done about it, and whether that work landed. It belongs at
design time, before the code exists, because moving a trust boundary later is expensive.
This skill produces a diagram, a ranked threat list, and a set of tickets — not a
document that is read once. Done means every high-ranked threat has either a mitigation
in the backlog or a written, dated acceptance.

## When to activate

- A new service, integration, or externally reachable feature is being designed
- Authentication, payments, file upload, or personal data handling is being added
- A trust boundary shifts: a new tenant model, a new third party, a new agent with tools
- Before a security review or penetration test, so the testers get a map
- After an incident, to check whether the model missed the class of failure
- User says "threat model", "attack surface", "STRIDE", "security design review",
  "what could go wrong here"

## When NOT to use

- Reviewing code that already exists for concrete bugs — use
  [security-review](../security-review/SKILL.md)
- Running scanners over a repository — use [security-scan](../security-scan/SKILL.md)
- Control evidence for a compliance audit — use
  [soc2-readiness](../soc2-readiness/SKILL.md)
- Attacks specific to a model-driven agent's tool use — use
  [prompt-injection-defense](../prompt-injection-defense/SKILL.md)
- A one-line copy change with no new data flow. Modeling has a cost; spend it where
  a boundary moves.

## Prerequisites

- An architecture sketch or the ability to read the code paths under discussion
- Knowledge of what data the system holds and which parts are regulated
- Attendance from someone who operates the system, not only who wrote it
- 90 minutes for a first pass on a feature; a full system takes several sessions

## Process

### 1. Scope to something you can finish

Pick one of: a feature, a service, a data flow, or a trust boundary. Write the scope
statement first and refuse to widen it mid-session.

```markdown
## Scope: document-sharing feature
In scope: upload API, object storage, share-link generation, viewer endpoint,
  the notification worker.
Out of scope: billing, the marketing site, the admin console (modeled separately
  on 2026-04-02).
Assets: uploaded files, share tokens, user email addresses.
Assumed already true: TLS everywhere, the platform IAM baseline, host patching.
```

Listing assumptions is what keeps the session from re-litigating the network layer.

### 2. Draw the data-flow diagram with trust boundaries

Four element types are enough: external entity, process, data store, data flow. A trust
boundary is any line where the level of trust in the data changes — the internet edge,
a tenant partition, a privilege change, a call to a third party, a queue consumed by a
different service.

```text
 [Browser]                          |  internet boundary
    | 1. POST /upload (multipart)   |
    v                               |
 (Upload API) --2. put--> [[Object store]]
    | 3. enqueue job
    v
 (Scan worker) --4. fetch--> [[Object store]]
    | 5. verdict
    v
 [[Metadata DB]]  <--6. read-- (Viewer API) <--7. GET /s/:token-- [Anonymous visitor]
                                                 |  internet boundary, unauthenticated
```

Number the flows. Threats are enumerated per flow and per boundary crossing, so the
numbering becomes the finding identifier.

### 3. Enumerate with STRIDE, one element at a time

| Category | Question to ask of this element | Property lost |
| --- | --- | --- |
| Spoofing | Can a caller claim to be someone else? | Authentication |
| Tampering | Can data be modified in transit or at rest? | Integrity |
| Repudiation | Can an actor deny having done it? | Non-repudiation |
| Information disclosure | Can data reach someone not entitled to it? | Confidentiality |
| Denial of service | Can a caller exhaust a resource? | Availability |
| Elevation of privilege | Can a caller gain rights they were not granted? | Authorization |

Applied to flow 7 above:

```markdown
### T-07-I  Information disclosure via share-token guessing
Element: Viewer API, unauthenticated boundary
Threat: Share tokens are sequential base36; an anonymous visitor enumerates them
        and reads other tenants' documents.
Existing control: none
Mitigation: 128-bit CSPRNG tokens, per-IP rate limit, optional expiry, audit read
Owner: platform
Status: open

### T-07-D  Denial of service via unbounded range requests
Element: Viewer API
Threat: Repeated large range requests against big objects saturate egress.
Existing control: CDN in front
Mitigation: signed URLs with short TTL, per-token concurrency cap
Status: accepted for now, revisit at 10x traffic
```

Where the flow crosses a boundary, also ask the four boundary questions: is the caller
authenticated, is the payload validated on the receiving side, is the response
authorized, is the crossing logged.

### 4. Use attack trees where a goal has many paths

STRIDE enumerates broadly. An attack tree goes deep on one attacker goal and is the
better tool for chained weaknesses.

```text
GOAL: read another tenant's document
├── OR  obtain a valid share token
│   ├── AND guess it            (needs weak entropy AND no rate limit)
│   ├── OR   find it in a log   (token in query string AND logs readable)
│   └── OR   receive it by referrer leak (token in URL AND external link on page)
├── OR  bypass the tenant predicate
│   ├── OR   IDOR on /documents/:id
│   └── OR   SQL injection reaching the ORM
└── OR  compromise a credential with cross-tenant reach
    ├── OR   support-tool session hijack
    └── OR   leaked service account key
```

Each leaf that requires two conditions joined by AND tells you where a single cheap
control breaks the whole path. Fix those first.

### 5. Rank by exploitability, not by dread

Score each threat on two axes and sort. Keep the scale coarse; precision here is fake.

| Axis | 1 | 2 | 3 |
| --- | --- | --- | --- |
| Exploitability | Needs insider access or a chained prerequisite | Needs an authenticated account | Anonymous, remote, scriptable |
| Impact | Single record, recoverable | Single tenant, or reputational | Cross-tenant, regulated data, funds, or full compromise |

Priority is the product. Treat anything scoring 6 or above as a release blocker; 3 to 4
goes in the next cycle; 1 to 2 is documented and accepted. Record which controls already
exist before scoring — an unmitigated 3x3 and a mitigated 3x3 are different tickets.

Prefer this over a numeric risk formula. A model that produces 7.4 invites arguments
about the decimal instead of about the control.

### 6. Turn findings into tickets, or the model was theatre

Every threat leaves the session in one of three states, and no others:

- **Mitigated** — a ticket exists, linked to the threat id, with an owner and a date
- **Accepted** — written rationale, named accepter, and a review date
- **Transferred** — contractually or by moving the function to a provider

```markdown
[SEC] T-07-I: replace sequential share tokens with 128-bit random
Threat model: docs/security/tm-document-sharing.md#T-07-I
Acceptance:
  - tokens generated from a CSPRNG, >= 128 bits, base64url
  - existing tokens migrated or expired
  - rate limit on /s/:token, 20 req/min/IP
  - test: sequential-guess script yields zero hits over 10k attempts
```

Store the model in the repository next to the code it describes, so a diff to the design
shows up in review.

### 7. Re-model on triggers, not on a calendar

Re-open the model when a boundary changes: a new external integration, a new tenancy
or sharing model, a new privileged internal tool, a move to a different runtime or
cloud, an agent given a new tool, or any incident whose class the model did not
contain. Annual reviews without a trigger produce stale documents; trigger-based
reviews stay accurate.

## Checklist

- [ ] Scope statement written, with explicit out-of-scope items and assumptions
- [ ] Data-flow diagram exists with numbered flows and marked trust boundaries
- [ ] Every process, store, and boundary crossing was walked through all six STRIDE letters
- [ ] At least one attack tree drawn for the highest-value attacker goal
- [ ] Each threat records the control that already exists, if any
- [ ] Threats ranked on exploitability and impact; blockers identified
- [ ] Every threat is mitigated, accepted with an owner and date, or transferred
- [ ] Tickets link back to threat identifiers, and the model links to the tickets
- [ ] Model committed under `docs/security/` beside the code it covers
- [ ] Re-model triggers written down in the document

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Session runs long and covers nothing | Scope was the whole platform | Scope to one feature or one data flow |
| Findings are generic ("validate input") | Threats not tied to a numbered flow | Force every threat to name an element and a flow |
| Model never revisited | No trigger list, only a yearly reminder | Define change triggers and hook them to design review |
| Everything is ranked critical | Impact scored without exploitability | Score both axes; rank by product |
| Engineers ignore the output | No tickets created | Leave the session with linked tickets or do not hold it |
| Same class of incident recurs | Boundary assumptions never validated in code | Add a test per boundary assumption |
| Diagram disagrees with reality | Drawn from the design doc, not the code | Walk one real request end to end while drawing |
| Third-party risk missing | External entities drawn as trusted | Every external call is a boundary crossing |

## References

- STRIDE threat categories, Microsoft Security Development Lifecycle
- OWASP Threat Modeling Cheat Sheet and the Threat Modeling Manifesto
- NIST SP 800-154, guide to data-centric system threat modeling
- Attack trees as a structured goal-decomposition technique
- [security-review](../security-review/SKILL.md),
  [authn-authz-patterns](../authn-authz-patterns/SKILL.md),
  [prompt-injection-defense](../prompt-injection-defense/SKILL.md)
