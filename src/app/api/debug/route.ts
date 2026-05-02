import { NextRequest, NextResponse } from "next/server";
import { generateDebugArtifact } from "@/lib/ai";
import { getState, upsertArtifact } from "@/lib/store";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { metric?: string; symptom?: string; evidence?: string };
  const state = await getState();

  if (!state.workspace) {
    return new NextResponse("Workspace is required before running the debugger.", { status: 400 });
  }

  if (!payload.metric?.trim()) {
    return new NextResponse("Metric is required.", { status: 400 });
  }

  const artifact = await generateDebugArtifact(state, {
    metric: payload.metric.trim(),
    symptom: payload.symptom?.trim() || "No symptom supplied.",
    evidence: payload.evidence?.trim() || ""
  });

  const updatedState = await upsertArtifact(artifact);
  return NextResponse.json({ artifact, state: updatedState });
}
