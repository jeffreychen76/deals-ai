import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { extractUploadContent } from "@/lib/file-extract";
import { getUploadsDir, saveUpload } from "@/lib/store";
import { UploadedFile } from "@/lib/types";
import { nowIso } from "@/lib/utils";

function detectKind(name: string, mimeType: string): UploadedFile["kind"] {
  const lower = name.toLowerCase();
  if (mimeType.startsWith("image/")) return "image";
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".csv")) return "csv";
  if (lower.endsWith(".txt") || lower.endsWith(".md")) return "text";
  return "other";
}

export async function POST(request: NextRequest) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return new NextResponse("File is required.", { status: 400 });
  }

  const uploadsDir = await getUploadsDir();
  const extension = path.extname(file.name);
  const storedName = `${Date.now()}-${crypto.randomUUID()}${extension}`;
  const bytes = Buffer.from(await file.arrayBuffer());
  const filePath = path.join(uploadsDir, storedName);
  await fs.writeFile(filePath, bytes);

  const kind = detectKind(file.name, file.type);
  const extraction = await extractUploadContent(kind, bytes, { filePath });

  const uploadedFile: UploadedFile = {
    id: crypto.randomUUID(),
    name: file.name,
    storedName,
    mimeType: file.type || "application/octet-stream",
    kind,
    extractionStatus: extraction.extractionStatus,
    extractedText: extraction.extractedText,
    headings: extraction.headings,
    pageCount: extraction.pageCount,
    preview: extraction.preview,
    size: file.size,
    uploadedAt: nowIso()
  };

  const state = await saveUpload(uploadedFile);
  return NextResponse.json({ file: uploadedFile, state });
}
