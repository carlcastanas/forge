---
name: soc2-readiness
description: Translate SOC 2 Trust Services Criteria into engineering work — control families as system properties, evidence collection as automation, access reviews, change management, vendor risk, and audit-window hygiene. Use when the user asks about SOC 2, an upcoming audit, control evidence, access reviews, or what engineering has to change to pass.
metadata:
  origin: FORGE
---

# SOC 2 Readiness

SOC 2 does not prescribe controls. It asks you to state what you do, then prove you did
it consistently across an observation window. Most engineering pain comes from proving
it after the fact, by hand. This skill maps the Trust Services Criteria onto systems
engineers already own, and converts evidence gathering into pipeline output. Done means:
every control has a named owner, an automated producer of evidence, and a sample the
auditor can pull without an engineer opening a console.

> This skill covers engineering readiness. Scope, opinion, and report issuance are the
> auditor's; legal and policy language is not decided here.

## When to activate

- A Type I or Type II audit has been scheduled or is being scoped
- A customer security questionnaire blocks a deal and names SOC 2
- Setting up access reviews, change management, or logging to be auditable
- Choosing a compliance automation platform, or replacing manual evidence gathering
- Preparing for an observation window that has not started yet
- User says "SOC 2", "Type II", "control evidence", "access review", "audit window",
  "TSC", "our auditor asked for"

## When NOT to use

- Health data handling under HIPAA — use [hipaa-compliance](../hipaa-compliance/SKILL.md)
  or [healthcare-phi-compliance](../healthcare-phi-compliance/SKILL.md)
- Finding actual vulnerabilities in code — use
  [security-review](../security-review/SKILL.md); a clean audit is not a secure system
- Designing the credential storage the controls describe — use
  [secrets-management](../secrets-management/SKILL.md)
- Enumerating what an attacker would do — use
  [threat-modeling](../threat-modeling/SKILL.md)

## Prerequisites

- Decided which criteria are in scope: Security is mandatory; Availability,
  Confidentiality, Processing Integrity, and Privacy are elective
- A defined system boundary — which products, environments, and subservice
  organizations the report covers
- Administrative access to identity provider, source host, cloud accounts, and ticketing
- Understanding that a Type II covers a window (commonly 3 to 12 months); evidence
  created after the window closes does not count for that window

## Process

### 1. Map criteria to systems you already run

The common criteria are organizational. Each one lands on infrastructure an engineering
team already operates.

| Criteria area | Engineering reality | Primary system of record |
| --- | --- | --- |
| CC5, CC6 — logical access | SSO enforced, MFA required, least privilege, joiner/mover/leaver | Identity provider, cloud IAM |
| CC6 — boundary protection | Network segmentation, no public data stores, TLS in transit, encryption at rest | Cloud config, IaC |
| CC7 — operations and monitoring | Centralized logs, alerting, vulnerability management, incident response | Log platform, on-call tooling |
| CC8 — change management | Peer review, CI gates, traceable deploys, rollback | Source host, CI/CD |
| CC9 / CC3 — risk and vendors | Risk register, vendor reviews, subservice monitoring | Register document, procurement |
| A1 — availability | Backups tested, capacity monitored, DR exercised | Backup tooling, runbooks |
| C1 — confidentiality | Data classification, retention, secure disposal | Data map, lifecycle policies |

Write one row per control you intend to claim, and delete every control you cannot
actually operate. Claiming a control you do not run is the fastest route to an
exception in the report.

### 2. Make evidence a build artifact

Anything an engineer produces by hand once a quarter will be missing when sampled.
Emit evidence on a schedule, timestamped, into immutable storage.

```yaml
# .github/workflows/compliance-evidence.yml
name: compliance-evidence
on:
  schedule: [{ cron: "0 6 * * 1" }]   # weekly, inside the observation window
  workflow_dispatch:

permissions:
  id-token: write     # OIDC to the cloud account; no stored keys
  contents: read

jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.EVIDENCE_ROLE_ARN }}
          aws-region: us-east-1

      - name: IAM users without MFA (CC6.1)
        run: |
          aws iam generate-credential-report >/dev/null
          aws iam get-credential-report --query Content --output text \
            | base64 -d > evidence/iam-credential-report.csv

      - name: Public storage exposure (CC6.6)
        run: |
          aws s3api list-buckets --query 'Buckets[].Name' --output text \
            | tr '\t' '\n' \
            | while read -r b; do
                aws s3api get-public-access-block --bucket "$b" \
                  --output json > "evidence/pab-$b.json" 2>/dev/null || \
                  echo "{\"bucket\":\"$b\",\"publicAccessBlock\":null}" > "evidence/pab-$b.json"
              done

      - name: Branch protection state (CC8.1)
        run: gh api "repos/$GITHUB_REPOSITORY/branches/main/protection" > evidence/branch-protection.json
        env: { GH_TOKEN: "${{ github.token }}" }

      - name: Publish with a retention lock
        run: aws s3 sync evidence/ "s3://$EVIDENCE_BUCKET/$(date -u +%Y-%m-%d)/"
```

Store to a bucket with object lock and versioning. Immutability is what makes the
sample credible.

### 3. Run access reviews as a diff, not a meeting

Quarterly review of every human and machine principal against an expected baseline.
The reviewable artifact is the delta.

```bash
# Actual entitlements from the identity provider, normalized and sorted
okta-cli users list --format json \
  | jq -r '.[] | select(.status=="ACTIVE") | [.profile.email, (.groups|join(";"))] | @csv' \
  | sort > /tmp/actual.csv

# Baseline committed in the repo and changed only by reviewed pull request
sort access-baseline.csv > /tmp/expected.csv

diff /tmp/expected.csv /tmp/actual.csv > access-review-$(date -u +%Y-%m-%d).diff
```

Every line of the diff gets one of: approved (baseline updated in a reviewed PR),
revoked (ticket with a completion timestamp), or exception (owner and expiry). Empty
diffs are the goal, and they are also acceptable evidence.

Terminations are the control auditors sample hardest. Wire deprovisioning to the HR
system so revocation is automatic and produces a timestamp; a same-day manual process
that occasionally slips will surface as an exception.

### 4. Let change management fall out of the pipeline

Auditors sample deploys and ask: was it reviewed, was it tested, who approved, could it
be rolled back. Configure the repository so the answer is structural.

- Protected default branch: no direct pushes, no self-approval, stale approvals dismissed
- Required status checks: tests, lint, secret scan, dependency audit
- Signed commits or signed tags for release artifacts
- Deploy jobs that record commit SHA, actor, environment, and timestamp
- Emergency change path that is defined in advance, requires retroactive review within
  a stated period, and is itself logged

Two things break this control more than any other: administrators who can bypass branch
protection, and a CI service account that can push to `main`. Remove both, or document
them as a compensating control with a monitoring alert.

### 5. Keep vendor risk proportional to data reach

Maintain one register with: vendor, data categories they receive, environment access,
criticality, review cadence, and the date their last assurance report was reviewed.

Tier by reach, not by spend. A log aggregator that receives production request bodies
outranks a large-invoice tool that never touches customer data. For subservice
organizations named in your report — cloud provider, managed database, payment
processor — read their report's complementary user entity controls and confirm you
actually implement each one. Those are obligations you inherit.

### 6. Practice the window before it opens

Run a dry sample four to six weeks before the observation window starts. Pick five
controls, ask for evidence exactly as an auditor would, and time it.

```markdown
Dry-run sample, 2026-05-04
CC6.1  Pull 3 users onboarded last quarter; show access approval + MFA enrollment.
CC6.3  Pull 3 terminations; show revocation timestamp within 24h.
CC7.2  Show alert-to-acknowledge for one production incident, with the postmortem.
CC8.1  Pull 5 production deploys; show PR, approver, passing checks, rollback plan.
A1.2   Show the most recent restore test and its verification output.
Findings: CC6.3 evidence required a manual console screenshot -> automate before the
          window opens. CC7.2 postmortem template lacks a root-cause field.
```

During the window: do not disable a control temporarily, do not let evidence collection
lapse, and keep the on-call and incident record honest. A period of missing evidence
becomes a stated exception in the report.

### 7. Separate the report from the security posture

A SOC 2 report states that controls you described operated as described. It does not
say the system is hard to attack. Keep the actual security work — threat modeling,
dependency hygiene, penetration testing, header hardening — running independently, and
do not let audit preparation consume the quarter that was meant for it.

## Checklist

- [ ] Trust Services Criteria in scope chosen and system boundary written down
- [ ] Control matrix lists owner, description, frequency, and evidence source per control
- [ ] No claimed control lacks a real operating process
- [ ] Evidence collection runs on a schedule into versioned, retention-locked storage
- [ ] SSO enforced, MFA required, admin access time-bound or approval-gated
- [ ] Access review runs as a diff against a version-controlled baseline
- [ ] Termination revocation is automated from the HR system and timestamped
- [ ] Branch protection blocks direct pushes and self-approval, including for admins
- [ ] Deploy records capture commit, actor, checks, and rollback path
- [ ] Vendor register tiered by data reach; subservice CUECs reviewed and implemented
- [ ] Backup restore tested within the window, with output retained
- [ ] Dry-run sample completed before the observation window opens

## Failure modes

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| Engineers spend the audit week taking screenshots | Evidence gathered manually | Move collection into scheduled CI with retained artifacts |
| Exception for terminated user access | Manual deprovisioning that slipped | Automate revocation from the HR trigger |
| Deploys cannot be traced to an approver | Direct pushes or admin bypass allowed | Enforce branch protection with no bypass; log exceptions |
| Auditor rejects evidence as unverifiable | Screenshot with no timestamp or source | Emit machine-generated output to immutable storage |
| Controls degrade after the report issues | Compliance treated as a project | Alert on control drift the same way as on uptime |
| Vendor list is stale | Register maintained outside procurement | Make register entry a step in vendor onboarding |
| Passing report, then a breach | Controls confused with security | Keep threat modeling and testing on their own cadence |
| Backups exist but restore was never proven | No restore test in the window | Schedule and record a restore, retain the verification |

## References

- AICPA Trust Services Criteria (2017, with 2022 points of focus)
- SSAE 18 / AT-C 105 and 205 attestation standards
- CIS Controls v8, mapped to common criteria for technical baselines
- NIST SP 800-53 Rev. 5 control families, useful as a cross-reference
- [secrets-management](../secrets-management/SKILL.md),
  [dependency-supply-chain](../dependency-supply-chain/SKILL.md),
  [threat-modeling](../threat-modeling/SKILL.md)
