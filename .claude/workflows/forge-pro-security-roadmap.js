export const meta = {
  name: 'forge-pro-security-roadmap',
  description: 'Survey + web-research + triage both FORGE and Forge Shield, then synthesize a prioritized FORGE Pro security roadmap',
  whenToUse: 'Quarterly product/security planning for FORGE Pro and Forge Shield',
  phases: [
    { title: 'Survey', detail: 'map current Forge Shield + FORGE Pro capability, triage open PRs/issues on both repos' },
    { title: 'Research', detail: 'recent agentic-security CVEs, competitor gaps, unbuilt ideas, Sentry/code-review feature demand' },
    { title: 'Synthesize', detail: 'merge everything into a prioritized, MRR-biased roadmap' }
  ]
};

// ----- shared schemas -----
const TRIAGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    repo: { type: 'string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ref: { type: 'string', description: 'e.g. "PR #103" or "issue #102"' },
          title: { type: 'string' },
          category: { type: 'string', enum: ['merge', 'close', 'needs-work', 'triage-later', 'security-priority'] },
          rationale: { type: 'string' },
          proValue: { type: 'string', description: 'how this maps to FORGE Pro / MRR, or "none"' }
        },
        required: ['ref', 'title', 'category', 'rationale', 'proValue']
      }
    },
    summary: { type: 'string' }
  },
  required: ['repo', 'items', 'summary']
};

const CAPABILITY_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    area: { type: 'string' },
    haveToday: { type: 'array', items: { type: 'string' } },
    gaps: { type: 'array', items: { type: 'string' } },
    proLeverage: { type: 'array', items: { type: 'string' }, description: 'what could plausibly be paid/Pro-tier' },
    summary: { type: 'string' }
  },
  required: ['area', 'haveToday', 'gaps', 'proLeverage', 'summary']
};

const RESEARCH_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    topic: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          detail: { type: 'string' },
          source: { type: 'string', description: 'URL, CVE id, or product name' },
          gapVsUs: { type: 'string', enum: ['we-have-it', 'partial', 'missing'] },
          relevanceToForgeShield: { type: 'string' },
          proOpportunity: { type: 'string', description: 'how this could become FORGE Pro / paid value' }
        },
        required: ['title', 'detail', 'source', 'gapVsUs', 'proOpportunity']
      }
    },
    summary: { type: 'string' }
  },
  required: ['topic', 'findings', 'summary']
};

const ROADMAP_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    themes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: { name: { type: 'string' }, rationale: { type: 'string' } },
        required: ['name', 'rationale']
      }
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          title: { type: 'string' },
          area: { type: 'string', enum: ['forge-shield', 'forge-pro', 'forge-core', 'both'] },
          horizon: { type: 'string', enum: ['now', 'next', 'later'] },
          effort: { type: 'string', enum: ['S', 'M', 'L', 'XL'] },
          impact: { type: 'string', enum: ['low', 'medium', 'high', 'flagship'] },
          mrrAngle: { type: 'string' },
          description: { type: 'string' },
          linkedItems: { type: 'array', items: { type: 'string' } }
        },
        required: ['title', 'area', 'horizon', 'effort', 'impact', 'mrrAngle', 'description', 'linkedItems']
      }
    },
    top5Now: { type: 'array', items: { type: 'string' } },
    summary: { type: 'string' }
  },
  required: ['themes', 'items', 'top5Now', 'summary']
};

const GUARDRAILS = [
  'CONSTRAINTS: research/triage only. Do NOT modify any code, do NOT open/close/merge PRs, do NOT post comments,',
  'do NOT send any external message. Return findings as data only.',
  'Brand it "FORGE" (never "everything claude code"). Forge Shield was FEATURED at a hackathon, never say it "won".',
  'Forge Shield npm package is "forge-shield". Local clone: ~/GitHub/FORGE/forge-shield. FORGE repo: carlcastanas/FORGE. Forge Shield repo: carlcastanas/forge-shield.',
  'You have Bash (gh CLI), Read, Grep, Glob, and web tools (load via ToolSearch: WebSearch / firecrawl / exa).'
].join(' ');

phase('Survey');

const surveyThunks = [
  () =>
    agent(
      `${GUARDRAILS}\n\nSURVEY Forge Shield's CURRENT detection capability. Read ~/GitHub/FORGE/forge-shield: src/rules (built-in detectors), src/* area dirs (taint, injection, supply-chain, runtime, threat-intel, sandbox, policy, remediation, evidence-pack, harness-adapters), README.md, CHANGELOG.md, WORKING-CONTEXT.md. Produce an honest capability map: what classes of agentic-security risk it detects TODAY, where the gaps are, and which capabilities could plausibly be a paid/Pro tier (e.g. continuous monitoring, fleet dashboards, hosted scanning, evidence packs, org policy). area="forge-shield-capability".`,
      { label: 'survey:forge-shield-capability', phase: 'Survey', agentType: 'general-purpose', schema: CAPABILITY_SCHEMA }
    ),
  () =>
    agent(
      `${GUARDRAILS}\n\nSURVEY the CURRENT state of FORGE Pro / paid surface. Read in ~/GitHub/FORGE/forge: scripts/lib/control-pane/* (control pane, proximity, viz), scripts/lib/agent-proximity/*, docs/design/agent-proximity.md, README.md, any pricing/Pro/Enterprise mentions. Determine: what is free vs what is positioned as Pro/Enterprise today, what monetizable surfaces exist (control pane, 3D agent-airspace observability, shared knowledge, JIT team workflows, kanban), and where the paid value story is thin. area="forge-pro-surface".`,
      { label: 'survey:forge-pro-surface', phase: 'Survey', agentType: 'general-purpose', schema: CAPABILITY_SCHEMA }
    ),
  () =>
    agent(
      `${GUARDRAILS}\n\nTRIAGE every OPEN PR and ISSUE on the FORGE repo (carlcastanas/FORGE). Use gh: \`gh pr list --repo carlcastanas/FORGE --state open --limit 80 --json number,title,author,isDraft\` and \`gh issue list --repo carlcastanas/FORGE --state open --limit 80 --json number,title,labels\`. For the higher-signal ones, peek at the diff/body (\`gh pr view <n> --repo carlcastanas/FORGE\`). Categorize each: merge / close / needs-work / triage-later / security-priority, with a one-line rationale and any Pro/MRR value. Prioritize identifying security-relevant and Pro-relevant items. repo="carlcastanas/FORGE".`,
      { label: 'triage:forge', phase: 'Survey', agentType: 'general-purpose', schema: TRIAGE_SCHEMA }
    ),
  () =>
    agent(
      `${GUARDRAILS}\n\nTRIAGE every OPEN PR and ISSUE on the Forge Shield repo (carlcastanas/forge-shield). Use gh similarly. Pay special attention to the false-positive cluster (issues #100, #102, #99 "bm", PR #103) where the scanner penalizes its own recommended fix and flags benign strings — these hurt trust and conversion. Also assess #101 (external rule-pack loader --rule-pack) and #97 (FAQ docs). Categorize each: merge / close / needs-work / triage-later / security-priority, with rationale and Pro/MRR value. repo="carlcastanas/forge-shield".`,
      { label: 'triage:forge-shield', phase: 'Survey', agentType: 'general-purpose', schema: TRIAGE_SCHEMA }
    )
];

phase('Research');

const researchThunks = [
  () =>
    agent(
      `${GUARDRAILS}\n\nDEEP RESEARCH: recent (2025-2026) CVEs and disclosed vulnerability classes in AGENTIC / LLM / MCP security that a scanner like Forge Shield should detect. Use web tools (ToolSearch then WebSearch / firecrawl / exa). Cover: MCP server vulns (tool poisoning, rug-pull tool updates, prompt injection via tool descriptions, confused-deputy), CVEs in popular agent frameworks / MCP servers, npm/PyPI supply-chain attacks targeting AI tooling, prompt-injection-driven RCE, memory/context poisoning, credential exfiltration via agents. For each finding mark gapVsUs (we-have-it / partial / missing) vs Forge Shield's current detectors, and the Pro opportunity. topic="agentic-cves-2025-2026".`,
      { label: 'research:cves', phase: 'Research', agentType: 'general-purpose', schema: RESEARCH_SCHEMA }
    ),
  () =>
    agent(
      `${GUARDRAILS}\n\nDEEP RESEARCH: competitor / adjacent tools in agent + LLM + supply-chain security and what they do that Forge Shield does NOT. Use web tools. Cover products like: Protect AI, Lakera, Prompt Security, HiddenLayer, Snyk, Socket.dev, Endor Labs, Semgrep, GitGuardian, Invariant Labs (MCP-scan), Cloudflare/others' MCP security, plus any new entrants. For each, note their headline capability, whether Forge Shield has it (gapVsUs), and how a comparable or better capability could be packaged as FORGE Pro paid value. Also: pull npm download stats for "forge-shield" to ground the growth story if reachable. topic="competitor-gap-analysis".`,
      { label: 'research:competitors', phase: 'Research', agentType: 'general-purpose', schema: RESEARCH_SCHEMA }
    ),
  () =>
    agent(
      `${GUARDRAILS}\n\nIDEATION: agentic-security capabilities that have been discussed/considered for Forge Shield or FORGE but NOT yet built, plus net-new ideas grounded in the threat model. Read ~/GitHub/FORGE/forge-shield/WORKING-CONTEXT.md and any docs/ for hints of deferred work; read the Forge Shield README for the current feature set; then reason about the gaps. Think across the kill chain: discovery/config scan -> PR-time review -> CI gate -> runtime monitor -> incident evidence. Candidate ideas: real-time runtime guardrails, MCP supply-chain provenance/lockfile attestation, taint-tracking across tool calls, behavioral baselining of agents, secret/credential flow tracing, autofix with verification, hosted continuous scanning + dashboards, org policy as code, agent-identity/least-privilege. Mark gapVsUs and proOpportunity for each. topic="unbuilt-ideation".`,
      { label: 'research:ideation', phase: 'Research', agentType: 'general-purpose', schema: RESEARCH_SCHEMA }
    ),
  () =>
    agent(
      `${GUARDRAILS}\n\nRESEARCH: what developers actually want from existing security + code-review tooling (Sentry, GitHub code scanning / CodeQL, Snyk, Semgrep, SonarQube, Dependabot) and where those tools fall short for AI-agent codebases. Use web tools (look at user complaints, feature requests, comparison posts). Identify the unmet demand Forge Shield Pro could capture: e.g. PR-time security review tuned for agent configs, low-false-positive findings, IDE/editor integration, runtime error+security telemetry like Sentry but for agents, autofix, SARIF/GitHub integration, evidence/compliance packs. For each, gapVsUs and proOpportunity. topic="devtool-demand-gaps".`,
      { label: 'research:devtool-demand', phase: 'Research', agentType: 'general-purpose', schema: RESEARCH_SCHEMA }
    )
];

// Survey and research have no cross-dependency; run all 8 concurrently (the
// runtime caps concurrency anyway) and barrier here — synthesis needs everything.
const [survey, research] = await Promise.all([parallel(surveyThunks), parallel(researchThunks)]);

const surveyClean = survey.filter(Boolean);
const researchClean = research.filter(Boolean);
log(`survey: ${surveyClean.length}/4 returned, research: ${researchClean.length}/4 returned`);

phase('Synthesize');

const bundle = JSON.stringify({ survey: surveyClean, research: researchClean }, null, 2);

const roadmap = await agent(
  `${GUARDRAILS}\n\nYou are the synthesis lead. Below is JSON from 4 survey agents (Forge Shield capability, FORGE Pro surface, FORGE repo triage, Forge Shield repo triage) and 4 research agents (CVEs, competitors, unbuilt ideation, devtool demand).\n\nProduce a PRIORITIZED, MRR-BIASED roadmap for FORGE Pro (its Forge Shield and FORGE portions). Rules:\n- Bias hard toward what converts free users to paid and grows MRR. Forge Shield is doing ~10k npm downloads/week (~30k/month) on "forge-shield" - that is a huge top-of-funnel; the roadmap must include how to monetize that funnel (Pro tier, hosted scanning, dashboards, org policy, evidence/compliance packs).\n- Group into a few themes. Each roadmap item: area (forge-shield/forge-pro/forge-core/both), horizon (now/next/later), effort (S/M/L/XL), impact (low/medium/high/flagship), a concrete mrrAngle, a description, and linkedItems (PR/issue refs from the triage that map to it).\n- Fold the Forge Shield false-positive cluster fixes into "now" (trust is a conversion gate).\n- top5Now = the five highest-leverage things to do immediately.\n\nDATA:\n${bundle}`,
  { label: 'synthesize:roadmap', phase: 'Synthesize', agentType: 'general-purpose', schema: ROADMAP_SCHEMA }
);

return { survey: surveyClean, research: researchClean, roadmap };
