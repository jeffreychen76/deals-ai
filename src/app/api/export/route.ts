import { NextRequest, NextResponse } from "next/server";
import { exportArtifact } from "@/lib/export";
import { getArtifact } from "@/lib/store";
import { ExportFormat } from "@/lib/types";
import { slugify } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const payload = (await request.json()) as { artifactId?: string; format?: ExportFormat };

  if (!payload.artifactId || !payload.format) {
    return new NextResponse("artifactId and format are required.", { status: 400 });
  }

  const artifact = await getArtifact(payload.artifactId);
  if (!artifact) {
    return new NextResponse("Artifact not found.", { status: 404 });
  }

  const output = await exportArtifact(artifact, payload.format);

  return new NextResponse(new Uint8Array(output.body), {
    headers: {
      "Content-Type": output.contentType,
      "Content-Disposition": `attachment; filename="${slugify(artifact.title)}.${output.extension}"`
    }
  });
}
