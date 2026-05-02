import { NextRequest, NextResponse } from "next/server";
import { generateRecommendationArtifact } from "@/lib/ai";
import { getState, upsertArtifact } from "@/lib/store";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { brief?: string };
  const state = await getState();

  if (!state.workspace) {
    return new NextResponse("Workspace is required before generating recommendations.", { status: 400 });
  }

  const artifact = await generateRecommendationArtifact(state, payload);
  const updatedState = await upsertArtifact(artifact);
  return NextResponse.json({ artifact, state: updatedState });
}
