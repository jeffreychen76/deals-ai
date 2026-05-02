import {
  internalReferenceCitations,
  referenceDocPatterns,
  referenceWritingPrinciples,
  studioAiReferenceInsights,
  styleGuidePrompt
} from "@/lib/reference-style";
import { Artifact, AppState, ChatMessage, Citation, RecommendationIdea, UploadedFile } from "@/lib/types";
import { nowIso, truncate } from "@/lib/utils";

const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4.1-mini";

interface RecommendationPayload {
  brief?: string;
}

interface DebugPayload {
  metric: string;
  symptom: string;
  evidence: string;
}

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "how",
  "if",
  "in",
  "into",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "we",
  "what",
  "why",
  "with"
]);

function tokenize(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

function scoreUpload(file: UploadedFile, focusText: string, artifactKind?: "debug" | "mvp" | "prd" | "recommendation") {
  const haystack = [file.name, file.preview, file.headings?.join(" "), file.extractedText].filter(Boolean).join(" ").toLowerCase();
  const tokens = tokenize(focusText);
  let score = 0;

  for (const token of tokens) {
    if (haystack.includes(token)) {
      score += token.length > 5 ? 4 : 2;
    }
  }

  if (artifactKind === "debug") {
    if (file.kind === "csv") score += 8;
    if (file.kind === "image") score += 6;
    if (file.name.toLowerCase().includes("report")) score += 3;
  }

  if (artifactKind === "recommendation" || artifactKind === "mvp" || artifactKind === "prd") {
    if (file.kind === "pdf" || file.kind === "docx") score += 5;
    if (file.name.toLowerCase().includes("prd")) score += 5;
    if (file.name.toLowerCase().includes("report")) score += 2;
  }

  if (file.extractionStatus === "parsed") score += 2;
  if (file.headings?.length) score += Math.min(file.headings.length, 4);
  return score;
}

function selectRelevantUploads(
  state: AppState,
  focusText: string,
  options?: { artifactKind?: "debug" | "mvp" | "prd" | "recommendation"; limit?: number }
) {
  const limit = options?.limit ?? 4;
  return [...state.uploads]
    .map((file) => ({
      file,
      score: scoreUpload(file, focusText, options?.artifactKind)
    }))
    .filter((entry) => entry.score > 0 || entry.file.extractedText || entry.file.preview)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
    .map((entry) => entry.file);
}

function buildRelevantReferenceBlock(files: UploadedFile[]) {
  if (!files.length) {
    return "Uploaded references: none";
  }

  return `Uploaded references:\n${files
    .map((file) => {
      const headingSummary = file.headings?.length ? ` headings: ${file.headings.slice(0, 4).join(" | ")}` : "";
      const textSummary = file.extractedText ? ` excerpt: ${truncate(file.extractedText.replace(/\n/g, " "), 220)}` : "";
      return `${file.name}${headingSummary}${textSummary}`;
    })
    .join("\n")}`;
}

function buildContextSummary(
  state: AppState,
  focusText = "",
  options?: { artifactKind?: "debug" | "mvp" | "prd" | "recommendation" }
) {
  const workspace = state.workspace;

  if (!workspace) {
    return "Workspace is not configured yet.";
  }

  const uploaded = selectRelevantUploads(state, focusText, {
    artifactKind: options?.artifactKind,
    limit: 5
  });

  return [
    `Company: ${workspace.companyName}`,
    `Team: ${workspace.teamName}`,
    `Product: ${workspace.productName}`,
    `Product description: ${workspace.productDescription}`,
    `Target users: ${workspace.targetUsers}`,
    `Business goals: ${workspace.businessGoals}`,
    `North star metric: ${workspace.northStarMetric}`,
    `Key metrics: ${workspace.keyMetrics}`,
    `Current challenges: ${workspace.currentChallenges}`,
    `Notes: ${workspace.onboardingNotes}`,
    buildRelevantReferenceBlock(uploaded),
    `Internal style references: ${internalReferenceCitations.map((item) => item.title).join(", ")}`
  ].join("\n");
}

function dedupeCitations(citations: Citation[]) {
  const seen = new Set<string>();
  return citations.filter((citation) => {
    const key = `${citation.kind}:${citation.title}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function buildCitations(
  state: AppState,
  focusText: string,
  options?: { artifactKind?: "debug" | "mvp" | "prd" | "recommendation" }
): Citation[] {
  const uploaded = selectRelevantUploads(state, focusText, {
    artifactKind: options?.artifactKind,
    limit: 5
  }).map((file) => ({
    title: file.name,
    kind: "uploaded" as const
  }));

  return dedupeCitations([...uploaded, ...internalReferenceCitations]);
}

function buildClarifyingQuestions(state: AppState) {
  const workspace = state.workspace;
  if (!workspace) {
    return ["Set up the workspace before requesting a recommendation."];
  }

  const questions: string[] = [];
  if (workspace.productDescription.length < 50) {
    questions.push("Describe the product in more depth, including the core workflow, user habit, and why people come back.");
  }
  if (workspace.keyMetrics.length < 25) {
    questions.push("Add the key metrics and their definitions so the strategy can use real metric logic instead of generic assumptions.");
  }
  if (workspace.currentChallenges.length < 25) {
    questions.push("Explain the main product or business problem that needs intervention right now.");
  }
  if (workspace.businessGoals.length < 25) {
    questions.push("Clarify the business goal for this workstream: growth, retention, monetization, efficiency, or another priority.");
  }
  return questions;
}

function extractLatestUserIntent(messages: ChatMessage[]) {
  const latest = [...messages].reverse().find((message) => message.role === "user");
  return latest?.content ?? "";
}

function buildMockIdeas(state: AppState): RecommendationIdea[] {
  const workspace = state.workspace;
  const productName = workspace?.productName || "Product";
  const primaryMetric = workspace?.northStarMetric || "North star metric";

  if (productName.toLowerCase().includes("tiktok studio")) {
    return [
      {
        rank: 1,
        title: "Creator Copilot for performance diagnosis and next-best action",
        summary:
          "Use Studio AI to diagnose why a creator’s content is underperforming, compare it against history and similar creators, and recommend the next specific action.",
        rationale:
          "This is closest to the actual creator need shown in the strategy docs: personalized and actionable help, not generic AI. It also fits naturally into high-intent analytics surfaces where creators already want answers.",
        expectedImpact:
          `Strongest path to improve ${primaryMetric}, creator retention, and repeated engagement with analytics and growth workflows.`
      },
      {
        rank: 2,
        title: "Creator Inspiration and topic opportunity assistant",
        summary:
          "Help creators find what to post next by combining past content, similar creators, trend opportunities, and topic whitespace.",
        rationale:
          "Valuable and aligned with the Studio AI deck, but weaker than rank 1 because inspiration without diagnosis and action is easier to ignore or copy externally.",
        expectedImpact:
          "Could increase creation frequency and creator confidence, but the loop is weaker unless it is connected to concrete performance guidance."
      },
      {
        rank: 3,
        title: "Brand deal and MCN workflow manager",
        summary:
          "Automate operational tasks such as brief tracking, deliverables, follow-up reminders, and partner workflows.",
        rationale:
          "Potentially high monetization value for advanced creators, but narrower audience and less immediate as the first daily-use wedge.",
        expectedImpact:
          "More likely to deepen business workflow value than to create the broad creator habit needed for V1."
      }
    ];
  }

  return [
    {
      rank: 1,
      title: `${productName} decision copilot`,
      summary: `Recommend what to build next using product context, user problems, and ${primaryMetric}.`,
      rationale:
        "Best near-term wedge because it directly answers the strategy question while producing execution-ready artifacts.",
      expectedImpact: `Most direct path to influence ${primaryMetric} and decision quality at the same time.`
    },
    {
      rank: 2,
      title: `${productName} insight interpreter`,
      summary: "Turn raw analytics and reports into human-readable diagnosis and action.",
      rationale: "Strong adjacent capability, but slightly narrower than the full strategy recommendation loop.",
      expectedImpact: "Improves interpretation quality and actionability for the current workflow."
    },
    {
      rank: 3,
      title: `${productName} workflow automation layer`,
      summary: "Automate repetitive operational work tied to the product’s core users.",
      rationale: "Useful, but often easier to commoditize than differentiated product strategy.",
      expectedImpact: "Improves efficiency more than product direction quality."
    }
  ];
}

function bulletize(items: string[]) {
  return items.map((item) => `- ${item}`).join("\n");
}

function buildReferenceEvidence(state: AppState) {
  const workspace = state.workspace;
  const evidence = [
    `Product context says the team is solving: ${workspace?.currentChallenges ?? "challenge not provided"}`,
    `Target users are: ${workspace?.targetUsers ?? "target users not provided"}`,
    `Business goal is: ${workspace?.businessGoals ?? "business goal not provided"}`,
    `North star metric is: ${workspace?.northStarMetric ?? "north star metric not provided"}`
  ];

  if ((workspace?.productName ?? "").toLowerCase().includes("tiktok studio")) {
    evidence.push(
      "Reference PRDs show analytics and creator growth surfaces are high-intent entry points for deeper Studio value.",
      "Reference A/B results show tool-like guidance products can create more lift for lower-maturity or lower-follower creators.",
      "Reference Studio AI strategy notes show personalized plus actionable guidance is the gap between ideal and current AI quality."
    );
  }

  if (state.uploads.length) {
    evidence.push(`Uploaded references available: ${state.uploads.slice(0, 6).map((file) => file.name).join(", ")}`);
  }

  return evidence;
}

function buildMetricFramework(state: AppState, winner: string) {
  const workspace = state.workspace;
  return `| Metric layer | Proposed metrics | Why it matters |
| --- | --- | --- |
| Ultimate | ${workspace?.northStarMetric ?? "North star metric not provided"}; creator retention | Measures whether the recommendation changes the core business outcome rather than only clicks. |
| Intermediate | weekly active creators using ${winner}; insight-to-action completion rate; repeat usage of analytics and AI workflows | Shows whether users find the workflow useful before the ultimate metric moves. |
| Guardrail | trust or satisfaction signals; dismissal rate; support complaints; latency-sensitive abandonment | Protects against shipping a flashy AI surface that harms trust or interrupts the main workflow. |`;
}

function buildRankedIdeasTable(ideas: RecommendationIdea[]) {
  const rows = ideas
    .map(
      (idea) =>
        `| ${idea.rank} | ${idea.title} | ${idea.summary} | ${idea.expectedImpact} |`
    )
    .join("\n");

  return `| Rank | Bet | Summary | Expected impact |\n| --- | --- | --- | --- |\n${rows}`;
}

function buildRecommendationMarkdown(ideas: RecommendationIdea[], state: AppState, brief?: string) {
  const workspace = state.workspace;
  const winner = ideas[0];
  const intent = brief || extractLatestUserIntent(state.messages) || workspace?.currentChallenges || "No extra brief provided.";

  return `## TL;DR
Build **${winner.title}** first. It is the strongest near-term wedge because it converts existing creator analytics and product context into personalized, actionable next steps instead of generic AI output.

## Strategic context
- Product: ${workspace?.productName ?? "Unknown product"}
- User problem: ${workspace?.currentChallenges ?? "Unknown problem"}
- Why this matters now: ${workspace?.businessGoals ?? "Business goal not yet captured"}
- Latest brief: ${truncate(intent, 260)}

## Ranked options
${buildRankedIdeasTable(ideas)}

## Why rank 1 wins now
1. It solves the highest-frequency decision problem instead of a narrower operational edge case.
2. It matches the strongest pattern from the reference docs: users want guidance that is both personalized and directly actionable.
3. It fits naturally into high-intent usage moments such as analytics or performance review, where users are already looking for explanations and next steps.
4. It keeps the wedge focused enough for MVP while still leaving room for inspiration and operational agents later.

## Evidence and product logic
${bulletize(buildReferenceEvidence(state))}

## Segment and rollout logic
- Initial focus should bias toward creators or teams with clear unmet demand for tool-like guidance rather than the most mature users.
- The product should avoid a passive, easy-to-ignore AI card pattern. Recommendation quality and visible value in-context matter more than adding another surface.
- If baseline segment data is missing, treat this segmentation logic as a hypothesis to validate during rollout.

## Metric framework
${buildMetricFramework(state, winner.title)}

## Risks and assumptions
- Assumption: product data quality is sufficient to produce useful diagnosis and next-best actions.
- Assumption: creators or PM users are willing to trust structured AI guidance if it is specific and transparent.
- Risk: the output may feel generic if it does not use user history, peer benchmarks, or recent performance context.
- Risk: if the experience is too broad in V1, the product will lose clarity and behave like a generic assistant instead of a workflow tool.

## Open questions
- Which user segment is the best first rollout target?
- What exact evidence should be shown so users trust the recommendation?
- Which actions should remain recommendations only versus agentic execution?

## Recommendation
Proceed with **${winner.title}**. Next step is to turn this into an MVP discussion document with explicit scope, validation plan, and requirement boundaries.`;
}

function createArtifact(base: Omit<Artifact, "createdAt" | "id" | "updatedAt">): Artifact {
  const timestamp = nowIso();
  return {
    id: crypto.randomUUID(),
    createdAt: timestamp,
    updatedAt: timestamp,
    ...base
  };
}

function createNeedsInputArtifact(type: Artifact["type"], title: string, questions: string[]) {
  return createArtifact({
    type,
    title,
    status: "needs-input",
    content: `## More context needed
${questions.map((question) => `- ${question}`).join("\n")}

## Why this is required
The reference PRDs and A/B reports are strong because they are grounded in user need, business logic, and a clear metric model. The current context is not yet strong enough to reach that standard without guessing.`,
    meta: { questions, confidence: "Low", citations: internalReferenceCitations }
  });
}

async function fetchOpenAIJson<T>(system: string, user: string): Promise<T | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return null;
  }

  const body: Record<string, unknown> = {
    model: OPENAI_MODEL,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: system }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: user }]
      }
    ]
  };

  if (process.env.ENABLE_OPENAI_WEB_SEARCH === "true") {
    body.tools = [{ type: "web_search_preview" }];
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as Record<string, unknown>;
  const text = extractResponseText(payload);
  const match = text.match(/\{[\s\S]*\}/);

  if (!match) {
    return null;
  }

  try {
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}

function extractResponseText(input: unknown): string {
  if (typeof input === "string") {
    return input;
  }

  if (Array.isArray(input)) {
    return input.map(extractResponseText).join("\n");
  }

  if (!input || typeof input !== "object") {
    return "";
  }

  const record = input as Record<string, unknown>;
  const direct =
    typeof record.output_text === "string"
      ? record.output_text
      : typeof record.text === "string"
        ? record.text
        : "";

  if (direct) {
    return direct;
  }

  return Object.values(record).map(extractResponseText).join("\n");
}

function buildOpenAIPrompt(kind: keyof typeof referenceDocPatterns) {
  const pattern = referenceDocPatterns[kind].map((item) => `- ${item}`).join("\n");
  const principles = referenceWritingPrinciples.map((item) => `- ${item}`).join("\n");
  const studioInsights = studioAiReferenceInsights.map((item) => `- ${item}`).join("\n");

  return `${styleGuidePrompt}

General writing principles:
${principles}

Target document pattern for ${kind}:
${pattern}

Relevant Studio AI and creator-product strategy insights:
${studioInsights}

Never invent precise numbers. If baselines are unknown, label the assumption explicitly.
Return concise but detailed markdown with strong structure, strong logic, concrete requirement language, and real tradeoffs.`;
}

export async function generateChatReply(state: AppState, message: string) {
  const workspace = state.workspace;

  if (!workspace) {
    return "Set up the workspace first so I can anchor recommendations and documents to real product context.";
  }

  const references = state.uploads.length
    ? `I also have ${state.uploads.length} uploaded references to treat as supporting evidence and writing-style guidance.`
    : "No uploaded references are attached yet, so I will rely more heavily on workspace context and the built-in reference patterns.";

  return `I’m treating this as PM operating context for ${workspace.productName}.

${references}

Based on what you said, the next best actions are:
- generate the ranked top 3 product bets if the strategic question is still open
- generate the MVP discussion doc if the direction is mostly known
- run the metric debugger if the issue is performance deterioration

Current interpretation: ${truncate(message, 240)}`;
}

export async function generateRecommendationArtifact(state: AppState, payload: RecommendationPayload) {
  const questions = buildClarifyingQuestions(state);
  if (questions.length >= 2) {
    return createNeedsInputArtifact("recommendation", "Recommendation Memo - More context needed", questions);
  }
  const focusText = [payload.brief, extractLatestUserIntent(state.messages), state.workspace?.currentChallenges, state.workspace?.businessGoals]
    .filter(Boolean)
    .join(" ");

  const openAiResult = await fetchOpenAIJson<{
    title: string;
    content: string;
    winner: string;
    confidence: string;
    assumptions: string[];
    ideas: RecommendationIdea[];
    citations?: Citation[];
  }>(
    `${buildOpenAIPrompt("recommendation")}
Return only JSON with keys: title, content, winner, confidence, assumptions, ideas, citations.
ideas must be an array of exactly 3 ranked recommendations with rank, title, summary, rationale, expectedImpact.
content must include sections: TL;DR, Strategic context, Ranked options, Why rank 1 wins now, Evidence and product logic, Segment and rollout logic, Metric framework, Risks and assumptions, Open questions, Recommendation.`,
    `${buildContextSummary(state, focusText, { artifactKind: "recommendation" })}\n\nAdditional brief: ${payload.brief ?? "None"}`
  );

  if (openAiResult) {
    return createArtifact({
      type: "recommendation",
      title: openAiResult.title,
      status: "draft",
      content: openAiResult.content,
      meta: {
        winner: openAiResult.winner,
        confidence: openAiResult.confidence,
        assumptions: openAiResult.assumptions,
        rankedIdeas: openAiResult.ideas,
        citations: openAiResult.citations?.length
          ? dedupeCitations([...openAiResult.citations, ...buildCitations(state, focusText, { artifactKind: "recommendation" })])
          : buildCitations(state, focusText, { artifactKind: "recommendation" })
      }
    });
  }

  const ideas = buildMockIdeas(state);
  return createArtifact({
    type: "recommendation",
    title: "Recommendation Memo",
    status: "draft",
    content: buildRecommendationMarkdown(ideas, state, payload.brief),
    meta: {
      winner: ideas[0].title,
      confidence: "Medium-high",
      assumptions: [
        "Existing analytics surfaces can support plain-language explanation with moderate UI and data work.",
        "Users will trust recommendations if the evidence and next action are specific enough."
      ],
      rankedIdeas: ideas,
      citations: buildCitations(state, focusText, { artifactKind: "recommendation" })
    }
  });
}

function buildMvpMarkdown(state: AppState, winner: string) {
  const workspace = state.workspace;

  return `## Basic Info
| Field | Value |
| --- | --- |
| Doc type | MVP Discussion Doc |
| Product | ${workspace?.productName ?? "Unknown product"} |
| Team | ${workspace?.teamName ?? "Unknown team"} |
| Direction under review | ${winner} |
| Status | Draft |

## TL;DR
Build **${winner}** as the first sharp wedge. The MVP should not try to be a general assistant. It should diagnose what changed, explain why it likely changed, compare the creator against relevant history or peers when available, and recommend the next specific action.

## Background / problem
${workspace?.currentChallenges ?? "Problem statement not yet captured."}

## User need and product gap
- Target users: ${workspace?.targetUsers ?? "Target users not yet defined."}
- Current gap: users have data and product context, but they do not reliably get personalized, actionable guidance from it.
- Reference strategy lesson: generic AI value is weak; the real value is diagnosis plus actionability.

## What are we building?
Build a Studio AI workflow that:
1. accepts creator or product context plus performance signals
2. identifies the most likely bottleneck or opportunity
3. explains the diagnosis in plain language
4. recommends the next-best action with rationale
5. handles follow-up questions without pretending confidence when evidence is weak

## Why build it now?
1. It aligns directly with the business goal: ${workspace?.businessGoals ?? "Business goal not provided"}.
2. It uses existing high-intent product moments such as analytics review or growth planning.
3. It matches the strongest gap identified in the Studio AI reference deck: current AI guidance lacks personalization and actionability.
4. It is a focused MVP wedge that can later expand into inspiration, monetization, and operational agents.

## Long-term vision vs MVP
### Long-term vision
- full creator copilot across inspiration, analysis, growth, and operations
- stronger peer benchmarking and historical comparison
- more agentic task completion

### MVP scope
- one primary diagnosis-and-action workflow
- evidence-aware reasoning with explicit confidence
- support for uploaded references and screenshots
- editable decision document and PRD generation for internal product users

## User journey / key scenarios
1. User enters a question such as “what should I build next?” or “why did this metric drop?”
2. System checks workspace context and available evidence.
3. If context is weak, system asks a small number of precise follow-up questions.
4. System returns a decision-ready answer with rationale, impact logic, and next step.
5. User promotes the decision into a PRD once direction is approved.

## Success metrics
${buildMetricFramework(state, winner)}

## Assumptions to validate
- Users trust recommendations more if the system explains the reasoning and cites the available evidence.
- A specific next-best-action workflow creates more habit than a broad conversational surface.
- Lower-maturity users may show more benefit than mature power users, but this needs validation.

## Risks
- If the recommendations feel generic, users will stop trusting the workflow quickly.
- If latency is slow or the value is hidden in a passive card-like surface, usage will underperform.
- If the model cannot access enough relevant context, the system may ask too many questions and feel cumbersome.

## Open questions
- Which first surface should host the workflow: analytics, home, or a dedicated AI tab?
- How much peer comparison is needed before the diagnosis feels credible?
- Which actions are safe to automate in V1 versus recommend only?

## Recommendation
Proceed with **${winner}**, then use the PRD to narrow the first workflow, data inputs, instrumentation, and rollout plan.`;
}

export async function generateMvpArtifact(state: AppState) {
  const recommendation = state.artifacts.find((artifact) => artifact.type === "recommendation");
  const winner = recommendation?.meta.winner || buildMockIdeas(state)[0].title;
  const focusText = `${winner} ${state.workspace?.currentChallenges ?? ""} ${state.workspace?.businessGoals ?? ""}`;
  const citations =
    recommendation?.meta.citations?.length ? recommendation.meta.citations : buildCitations(state, focusText, { artifactKind: "mvp" });

  const openAiResult = await fetchOpenAIJson<{
    title: string;
    content: string;
    confidence: string;
    assumptions: string[];
    citations?: Citation[];
  }>(
    `${buildOpenAIPrompt("mvp")}
Return only JSON with keys: title, content, confidence, assumptions, citations.
content must include sections: Basic Info, TL;DR, Background / problem, User need and product gap, What are we building, Why build it now, Long-term vision vs MVP, User journey / key scenarios, Success metrics, Assumptions to validate, Risks, Open questions, Recommendation.`,
    `${buildContextSummary(state, focusText, { artifactKind: "mvp" })}\n\nApproved direction: ${winner}`
  );

  if (openAiResult) {
    return createArtifact({
      type: "mvp-doc",
      title: openAiResult.title,
      status: "draft",
      content: openAiResult.content,
      meta: {
        winner,
        confidence: openAiResult.confidence,
        assumptions: openAiResult.assumptions,
        citations: openAiResult.citations?.length ? dedupeCitations([...openAiResult.citations, ...citations]) : citations
      }
    });
  }

  return createArtifact({
    type: "mvp-doc",
    title: "MVP Discussion Doc",
    status: "draft",
    content: buildMvpMarkdown(state, winner),
    meta: {
      winner,
      confidence: recommendation?.meta.confidence ?? "Medium-high",
      assumptions: [
        "Diagnosis plus action is a sharper wedge than generic inspiration alone.",
        "High-intent analytics moments are appropriate entry surfaces."
      ],
      citations
    }
  });
}

function buildPrdMarkdown(state: AppState, winner: string) {
  const workspace = state.workspace;

  return `## Basic Info
| Field | Value |
| --- | --- |
| PRD | ${winner} |
| Product | ${workspace?.productName ?? "Unknown product"} |
| Team | ${workspace?.teamName ?? "Unknown team"} |
| Owner | ${workspace?.companyName ?? "Unknown company"} |
| Status | Draft |

## Change Log
| Date | Description | By |
| --- | --- | --- |
| ${new Date().toISOString().slice(0, 10)} | Initial draft generated from workspace context and reference PM docs | AI Product Strategist |

## Relevant Links
- Recommendation memo: use the current workspace recommendation artifact
- MVP discussion doc: use the current workspace MVP artifact
- Reference writing patterns: internal PRDs, A/B reports, and Studio AI strategy notes

## Intro & Goal
The goal of this PRD is to define the first version of **${winner}** inside ${workspace?.productName ?? "the product"} so the team can ship a narrow but high-value workflow that turns product context and performance data into personalized, actionable recommendations.

## What are we building?
We are building a guided AI workflow that:
1. ingests product or creator context plus relevant performance data
2. identifies the most likely bottleneck or opportunity
3. explains the diagnosis clearly
4. recommends the next-best action with reasoning
5. asks follow-up questions when the evidence is insufficient

## Why build it?
1. **User need**: ${workspace?.targetUsers ?? "Target users not provided"} need help converting data into decisions and actions, not only dashboards.
2. **Strategic fit**: ${workspace?.businessGoals ?? "Business goal not provided"}.
3. **Incremental value**: the workflow creates a repeatable, high-intent reason to return to the product and makes the rest of the product more useful.
4. **Reference lesson**: the strongest creator AI value is personalized and actionable guidance. Generic AI surfaces underperform.

## Success Metrics
| Metric layer | Metric | Measurement logic | Notes |
| --- | --- | --- | --- |
| Ultimate | ${workspace?.northStarMetric ?? "North star metric missing"} | Core business outcome | Do not fabricate baseline. Attach once available. |
| Ultimate | Creator retention or PM workflow retention | Repeat product usage | Especially important for habit formation. |
| Intermediate | AI workflow weekly active users | Adoption of the new workflow | Indicates whether users discover and reuse the feature. |
| Intermediate | Insight-to-action completion rate | Did the user act after reading the output? | Strong proxy for actionability. |
| Intermediate | Repeat usage after first successful session | Habit formation | Useful early read before retention stabilizes. |
| Guardrail | Recommendation dismissal rate | Trust proxy | High dismissal suggests low relevance or low trust. |
| Guardrail | Complaint or support rate tied to AI output | Safety and reliability | Protects against low-quality automation. |
| Guardrail | Latency-sensitive abandonment | Experience quality | Important because slow AI surfaces are easy to ignore. |

## Detailed Requirement Sections
### R1. Context understanding
- The system must accept conversational input, uploaded documents, screenshots, and metric tables.
- The system must preserve saved workspace context across sessions.
- The system must distinguish between known facts, uploaded evidence, and assumptions.

### R2. Diagnosis generation
- The system must identify the likely bottleneck or opportunity from the provided evidence.
- The system must explain the diagnosis in clear language rather than only listing raw metrics.
- The system must compare against history, peer context, or segment context when such evidence exists.

### R3. Action recommendation
- The system must recommend a next-best action that is specific enough to execute.
- The system must explain why that action is recommended and what success should look like.
- The system must avoid generic advice that does not connect to the observed bottleneck.

### R4. Confidence and follow-up
- The system must only state a strong hypothesis when evidence is sufficient.
- When evidence is weak, the system must ask concise, high-value follow-up questions.
- The system must clearly label partial conclusions.

### R5. Artifact generation
- The system must generate editable MVP discussion docs and PRDs in-app.
- The system must preserve a clear logic chain from recommendation memo to PRD.
- The system must support Markdown, DOCX, and PDF export.

## User Flows
### Primary flow
1. User provides workspace context and optional supporting files.
2. User asks what to build or why a metric changed.
3. System checks context quality and asks follow-up questions if needed.
4. System returns a structured recommendation or diagnosis.
5. User promotes the result into an MVP doc or PRD and edits it in the app.

### Secondary flow
1. User uploads screenshots, A/B reports, or CSVs after an initial low-confidence response.
2. System revises the diagnosis and strengthens or retracts hypotheses.

## Edge Cases
- Missing baselines or undefined metrics
- Contradictory signals across uploaded reports and current dashboards
- Segment lift that is positive in one cohort but negative overall
- Strong user pain with weak quantitative evidence
- Overbroad user request that spans multiple jobs-to-be-done at once

## Instrumentation / Events
- workspace_created
- recommendation_generated
- artifact_promoted_to_mvp_doc
- artifact_promoted_to_prd
- debugger_run
- follow_up_question_answered
- export_requested
- recommendation_action_clicked

## Experiment Design
- Start with a narrow rollout cohort rather than broad exposure.
- Compare treatment and control on workflow adoption, action completion, and retention proxies.
- Break down by user maturity, region, and primary entry surface.
- Review guardrail metrics before expansion.

## Rollout Plan
- Phase 1: internal dogfood with seeded examples and PM workflows
- Phase 2: limited external or internal beta on a narrow user segment
- Phase 3: expand only if quality, trust, and repeat usage meet threshold

## Risks
- Low trust if output is too generic or too aggressive about causality
- Weak adoption if the feature is surfaced passively and easy to skip
- Limited impact if the workflow is not tied to a real high-intent moment

## Open Questions
- What evidence display pattern most increases user trust?
- Which segment should be prioritized for the first beta?
- Which follow-up actions should stay manual in V1?

## Projection Rules and Data Gaps
Metric projections unavailable due to insufficient data. Use directional assumptions only until baseline and segment data are attached.
- If the workflow is truly actionable, intermediate usage and action completion should move before ultimate retention does.
- If lower-maturity users benefit more, segment-level lift may exceed overall average lift.`;
}

export async function generatePrdArtifact(state: AppState) {
  const recommendation = state.artifacts.find((artifact) => artifact.type === "recommendation");
  const winner = recommendation?.meta.winner || buildMockIdeas(state)[0].title;
  const focusText = `${winner} ${state.workspace?.currentChallenges ?? ""} ${state.workspace?.businessGoals ?? ""} detailed requirements success metrics rollout experiment`;
  const citations =
    recommendation?.meta.citations?.length ? recommendation.meta.citations : buildCitations(state, focusText, { artifactKind: "prd" });

  const openAiResult = await fetchOpenAIJson<{
    title: string;
    content: string;
    confidence: string;
    assumptions: string[];
    citations?: Citation[];
  }>(
    `${buildOpenAIPrompt("prd")}
Return only JSON with keys: title, content, confidence, assumptions, citations.
content must include sections: Basic Info, Change Log, Relevant Links, Intro & Goal, What are we building, Why build it, Success Metrics, Detailed Requirement Sections, User Flows, Edge Cases, Instrumentation / Events, Experiment Design, Rollout Plan, Risks, Open Questions, Projection Rules and Data Gaps.`,
    `${buildContextSummary(state, focusText, { artifactKind: "prd" })}\n\nApproved direction: ${winner}`
  );

  if (openAiResult) {
    return createArtifact({
      type: "prd",
      title: openAiResult.title,
      status: "draft",
      content: openAiResult.content,
      meta: {
        winner,
        confidence: openAiResult.confidence,
        assumptions: openAiResult.assumptions,
        citations: openAiResult.citations?.length ? dedupeCitations([...openAiResult.citations, ...citations]) : citations
      }
    });
  }

  return createArtifact({
    type: "prd",
    title: "Product Requirements Document",
    status: "draft",
    content: buildPrdMarkdown(state, winner),
    meta: {
      winner,
      confidence: recommendation?.meta.confidence ?? "Medium",
      assumptions: [
        "Personalized and actionable output is more important than broad AI surface coverage in V1.",
        "Baselines and launch thresholds will be added during planning."
      ],
      citations
    }
  });
}

function buildDebugLowEvidenceMarkdown(metric: string) {
  return `## TL;DR
There is not enough evidence yet to make a high-confidence causal call on **${metric}**. The right next step is to gather the smallest set of missing evidence that will separate instrumentation, traffic mix, and true product regression.

## More evidence needed
- Upload a pre/post trend screenshot for ${metric}.
- Share the affected segment, geography, or creator cohort.
- Add recent launches, experiments, or operational changes.
- Include any A/B report, dashboard export, or release notes that overlap with the drop.

## Why this matters
The reference A/B reports are strong because they do not stop at the top-line average. They break down by segment, explain why one cohort moved differently from another, and only make a recommendation once that logic is visible.

## Partial summary
The current signal is too weak to produce a confident root-cause hypothesis.`;
}

function buildDebugMarkdown(state: AppState, payload: DebugPayload) {
  return `## TL;DR
Current read: the issue is likely real enough to investigate, but the evidence set is still incomplete. The most likely buckets are instrumentation shift, product regression on the main workflow, or traffic-mix distortion.

## Background
- Metric: ${payload.metric}
- Reported symptom: ${payload.symptom}
- Product context: ${state.workspace?.currentChallenges ?? "No saved product challenge"}

## What changed
- User-reported evidence: ${truncate(payload.evidence, 320)}
- Available references: ${state.uploads.length ? state.uploads.slice(0, 6).map((file) => file.name).join(", ") : "No uploaded references"}

## Investigation logic
1. Validate whether the change is real or measurement-related.
2. Break down the change by segment, geography, creator maturity, and entry surface.
3. Map the timing against launches or experiment changes.
4. Only assign a strong product root cause if the segmented signal still holds.

## Hypothesis table
| Rank | Hypothesis | Why it is plausible | What would confirm it |
| --- | --- | --- | --- |
| 1 | Instrumentation or attribution shift | Metric movements often appear after event changes, dashboard logic changes, or rollout inconsistencies. | Audit event logging and compare raw event counts before and after the change. |
| 2 | Real product regression on the highest-friction workflow step | If a recent launch made the workflow slower, less clear, or less trustworthy, top-line usage can fall. | Break down by impacted journey step and compare affected cohorts to unaffected ones. |
| 3 | Traffic or cohort mix shift | Average performance can drop even if the per-user experience did not change. | Compare the metric within stable cohorts and by region or fan layer. |

## Evidence for and against
- For instrumentation-shift theory: missing launch/event audit and unclear trend structure.
- For regression theory: the user is reporting a meaningful symptom rather than only random noise.
- Against making a final call now: segment-level proof is still missing.

## Missing data
- pre/post segment comparison
- launch log or experiment timeline
- cohort or treatment breakdown
- screenshot of the metric trend

## Recommended next actions
- validate instrumentation before escalating a product root-cause call
- segment the issue by geography, creator maturity, and entry surface
- compare the affected window against launch or experiment changes
- if the regression is real, isolate the highest-friction step and plan rollback or targeted fix

## Partial-summary label
This is a partial but decision-usable summary. It narrows the search space, but a single root cause should not be declared yet.`;
}

export async function generateDebugArtifact(state: AppState, payload: DebugPayload) {
  const evidenceLength = `${payload.evidence} ${payload.symptom}`.trim().length;
  const focusText = `${payload.metric} ${payload.symptom} ${payload.evidence}`;

  if (evidenceLength < 80) {
    return createArtifact({
      type: "debug-report",
      title: `Metric Debugger - More context needed`,
      status: "needs-input",
      content: buildDebugLowEvidenceMarkdown(payload.metric),
      meta: {
        confidence: "Low",
        partial: true,
        citations: buildCitations(state, focusText, { artifactKind: "debug" }),
        questions: [
          `What exact time window did ${payload.metric} change?`,
          "Which user segment moved the most?",
          "What launches or experiment changes overlapped with the change?"
        ]
      }
    });
  }

  const openAiResult = await fetchOpenAIJson<{
    title: string;
    content: string;
    confidence: string;
    assumptions: string[];
    partial: boolean;
    questions?: string[];
    citations?: Citation[];
  }>(
    `${buildOpenAIPrompt("debug")}
Return only JSON with keys: title, content, confidence, assumptions, partial, questions, citations.
content must include sections: TL;DR, Background, What changed, Investigation logic, Hypothesis table, Evidence for and against, Missing data, Recommended next actions, Partial-summary label.
Do not provide high-confidence causal claims unless the evidence is sufficient.`,
    `${buildContextSummary(state, focusText, { artifactKind: "debug" })}\n\nMetric: ${payload.metric}\nSymptom: ${payload.symptom}\nEvidence: ${payload.evidence}`
  );

  if (openAiResult) {
    return createArtifact({
      type: "debug-report",
      title: openAiResult.title,
      status: openAiResult.confidence.toLowerCase().includes("low") ? "needs-input" : "draft",
      content: openAiResult.content,
      meta: {
        confidence: openAiResult.confidence,
        assumptions: openAiResult.assumptions,
        partial: openAiResult.partial,
        questions: openAiResult.questions,
        citations: openAiResult.citations?.length
          ? dedupeCitations([...openAiResult.citations, ...buildCitations(state, focusText, { artifactKind: "debug" })])
          : buildCitations(state, focusText, { artifactKind: "debug" })
      }
    });
  }

  return createArtifact({
    type: "debug-report",
    title: `Metric Debugger - ${payload.metric}`,
    status: "draft",
    content: buildDebugMarkdown(state, payload),
    meta: {
      confidence: "Medium",
      partial: true,
      citations: buildCitations(state, focusText, { artifactKind: "debug" }),
      questions: [
        "Can you upload the trend screenshot for the affected metric?",
        "Which segment or cohort saw the sharpest change?",
        "What launches landed immediately before the change?"
      ]
    }
  });
}
