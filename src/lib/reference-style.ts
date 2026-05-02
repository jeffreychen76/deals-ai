import { Citation } from "@/lib/types";

export const internalReferenceCitations: Citation[] = [
  { title: "[PRD] Creator Search in TikTok Studio App", kind: "internal" },
  { title: "[A/B Report] Creator Search in TikTok Studio App", kind: "internal" },
  { title: "[AB Report] Inapp CC Promotion Card iOS", kind: "internal" },
  { title: "[PRD] Promote TikTok Studio App in the Video Level Analytics Page", kind: "internal" },
  { title: "Standalone Creator App EN", kind: "internal" },
  { title: "Studio AI 提升作者创作经营效率 - 2026/4", kind: "internal" }
];

export const referenceWritingPrinciples = [
  "Lead with a direct recommendation or TL;DR before the long detail.",
  "Tie every product argument to user need, business goal, and expected metric movement.",
  "Separate known data from assumptions. Never invent baselines or lift percentages.",
  "Use segment logic when relevant: fan layer, geography, creator maturity, funnel step, or high-intent entry surface.",
  "Keep AI proposals personalized and actionable, not generic. Good output compares current performance, historical performance, and similar creators when available.",
  "Document quality should feel operational: metadata, rationale, expected impact, detailed requirements, experiment design, rollout, and open questions."
];

export const referenceDocPatterns = {
  recommendation: [
    "TL;DR / decision first",
    "ranked options with one clear winner",
    "why now tied to user need and product strategy",
    "expected impact split into ultimate, intermediate, and guardrail metrics",
    "risk, assumptions, and next step"
  ],
  mvp: [
    "basic info block",
    "background and problem framing",
    "what are we building and why now",
    "MVP scope versus long-term vision",
    "success metrics and validation plan",
    "open questions and recommendation"
  ],
  prd: [
    "basic info, change log, and relevant links",
    "intro and goal",
    "what are we building",
    "why build it with quantified opportunity",
    "success metrics table",
    "detailed requirement sections",
    "instrumentation, experiment design, rollout, risks, and open questions"
  ],
  debug: [
    "background and test or issue framing",
    "TL;DR with decision recommendation",
    "segment or funnel breakdowns",
    "evidence-backed interpretation",
    "explicit follow-up when the evidence is still incomplete"
  ]
};

export const studioAiReferenceInsights = [
  "Creators and creator managers both need diagnosis plus clear next-step guidance, but human support is resource-constrained.",
  "The strongest AI product value is not generic chat. It is personalized and actionable help across inspiration, performance analysis, and growth actions.",
  "Good guidance should identify the key bottleneck metric and then translate it into concrete actions like script, hook, framing, or workflow changes.",
  "Low-maturity or lower-follower creators often benefit more from tool-like guidance products than high-maturity creators.",
  "High-intent analytics surfaces can be strong entry points because users there already want to understand and improve performance.",
  "AI surfaces fail when value is hidden, load time is slow, or the content is too generic. Actionability and visibility matter."
];

export const styleGuidePrompt = `
Use the following internal document lessons as house style:

1. Recommendation and strategy docs:
- Start with TL;DR and the actual decision.
- Show ranked alternatives, not only one idea in isolation.
- Make the logic chain explicit: user problem -> product gap -> why this opportunity -> why this option now.
- Distinguish near-term wedge from long-term vision.

2. PRD writing:
- Include operational metadata, then move into Intro & Goal, What we are building, Why build it, and Success Metrics.
- Be detailed in requirement writing. Engineers should know what the system does, what it does not do, and what edge cases matter.
- Success metrics should be split into ultimate, intermediate, and guardrail metrics.
- Use assumptions and data gaps explicitly when baselines are unknown.

3. A/B or debugging writing:
- Lead with TL;DR and whether the result is positive, mixed, or negative.
- Break down by segment when the average hides different effects.
- Interpret not only what moved, but why it likely moved and what should happen next.

4. AI product strategy lessons:
- Personalized and actionable beats generic.
- Compare against creator history and relevant peers when possible.
- Focus on bottleneck metrics and concrete next actions.
- Avoid vague “AI card” value propositions that are easy for users to ignore.
`.trim();
