import { NextRequest, NextResponse } from "next/server";
import { saveWorkspace } from "@/lib/store";
import { WorkspaceContext } from "@/lib/types";
import { nowIso } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as Partial<WorkspaceContext>;
  const timestamp = nowIso();

  const workspace: WorkspaceContext = {
    id: crypto.randomUUID(),
    companyName: payload.companyName?.trim() || "Unknown company",
    teamName: payload.teamName?.trim() || "Unknown team",
    productName: payload.productName?.trim() || "New product",
    productDescription: payload.productDescription?.trim() || "",
    targetUsers: payload.targetUsers?.trim() || "",
    businessGoals: payload.businessGoals?.trim() || "",
    northStarMetric: payload.northStarMetric?.trim() || "",
    keyMetrics: payload.keyMetrics?.trim() || "",
    currentChallenges: payload.currentChallenges?.trim() || "",
    onboardingNotes: payload.onboardingNotes?.trim() || "",
    allowResearch: Boolean(payload.allowResearch),
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const state = await saveWorkspace(workspace);
  return NextResponse.json({ state });
}
