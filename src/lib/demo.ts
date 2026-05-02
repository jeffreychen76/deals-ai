import { WorkspaceContext } from "@/lib/types";

export const sampleDocumentTitles = [
  "[A/B Report] Creator Search in TikTok Studio App",
  "[AB Report] Inapp CC Promotion Card iOS",
  "[PRD] Creator Search in TikTok Studio App",
  "[PRD] Promote Official Updates to Creators inside Creator Studio",
  "[PRD] Promote TikTok Studio App in the Video Level Analytics Page",
  "[PRD] TikTok Studio App Feed",
  "Standalone Creator App EN",
  "Studio AI 提升作者创作经营效率",
  "TikTok Studio App 增长规划"
];

export const demoWorkspaceSeed: Omit<WorkspaceContext, "createdAt" | "id" | "updatedAt"> = {
  companyName: "TikTok",
  teamName: "TikTok Studio Product",
  productName: "TikTok Studio AI",
  productDescription:
    "An AI assistant inside TikTok Studio that helps creators understand performance, find inspiration, learn platform best practices, and complete operational tasks with guided agents.",
  targetUsers:
    "Active creators, emerging creators, creator managers, and MCN partners that use TikTok Studio to grow and run their business.",
  businessGoals:
    "Increase creator retention, improve creator success rate, strengthen trust in TikTok Studio as the daily operating system for creators, and create clear paths to monetization support.",
  northStarMetric: "Weekly active creators completing a high-value action in TikTok Studio",
  keyMetrics:
    "7-day creator retention, weekly active creators, feature adoption, content publish frequency, creator revenue-linked actions, guardrail trust and satisfaction metrics",
  currentChallenges:
    "Creators struggle to translate analytics into action, discover relevant next steps, manage business operations, and trust where to spend time inside TikTok Studio.",
  onboardingNotes:
    "Use uploaded PRDs and A/B reports as writing-style references. Prefer concise, executive-readable logic. Flag unknown metrics instead of inventing them.",
  allowResearch: true
};
