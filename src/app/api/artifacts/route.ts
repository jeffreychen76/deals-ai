import { NextRequest, NextResponse } from "next/server";
import { generateMvpArtifact, generatePrdArtifact } from "@/lib/ai";
import { getState, upsertArtifact } from "@/lib/store";
import { Artifact } from "@/lib/types";
import { nowIso } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { action?: "generate-mvp" | "generate-prd" };
  const state = await getState();

  if (!state.workspace) {
    return new NextResponse("Workspace is required before generating documents.", { status: 400 });
  }

  if (payload.action === "generate-mvp") {
    const artifact = await generateMvpArtifact(state);
    const updatedState = await upsertArtifact(artifact);
    return NextResponse.json({ artifact, state: updatedState });
  }

  if (payload.action === "generate-prd") {
    const artifact = await generatePrdArtifact(state);
    const updatedState = await upsertArtifact(artifact);
    return NextResponse.json({ artifact, state: updatedState });
  }

  return new NextResponse("Unknown artifact action.", { status: 400 });
}

export async function PUT(request: NextRequest) {
  const artifact = (await request.json()) as Artifact;

  if (!artifact?.id) {
    return new NextResponse("Artifact id is required.", { status: 400 });
  }

  const updatedArtifact: Artifact = {
    ...artifact,
    updatedAt: nowIso()
  };

  const state = await upsertArtifact(updatedArtifact);
  return NextResponse.json({ state });
}
