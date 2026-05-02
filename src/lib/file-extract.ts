import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { truncate } from "@/lib/utils";

const execFileAsync = promisify(execFile);

type UploadKind = "csv" | "docx" | "image" | "other" | "pdf" | "text";

interface ExtractionResult {
  extractedText?: string;
  extractionStatus: "failed" | "none" | "parsed" | "partial";
  headings?: string[];
  pageCount?: number;
  preview: string;
}

interface ExtractionOptions {
  filePath?: string;
}

function cleanExtractedText(input: string) {
  return input
    .replace(/\u0000/g, " ")
    .replace(/\u0001/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[^\S\r\n]{2,}/g, " ")
    .trim();
}

function inferHeadings(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const headings: string[] = [];
  for (const line of lines) {
    if (headings.length >= 8) {
      break;
    }

    const isLikelyHeading =
      line.length >= 4 &&
      line.length <= 90 &&
      !line.includes("|") &&
      !/^[0-9]+(\.[0-9]+)?[%)]?$/.test(line) &&
      (/^[A-Z0-9[\]#(]/.test(line) || /^[一-龥]/.test(line));

    if (isLikelyHeading) {
      headings.push(line);
    }
  }

  return [...new Set(headings)];
}

function buildPreview(text: string) {
  const firstParagraph = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join(" ");

  return truncate(firstParagraph || "Text extracted, but preview is empty.", 260);
}

async function extractPdf(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    const text = cleanExtractedText(result.text || "");

    if (!text) {
      return {
        extractionStatus: "partial",
        preview: "PDF uploaded. Text extraction returned very little usable text.",
        pageCount: result.numpages
      };
    }

    return {
      extractedText: truncate(text, 9000),
      extractionStatus: "parsed",
      headings: inferHeadings(text),
      pageCount: result.numpages,
      preview: buildPreview(text)
    };
  } catch {
    return {
      extractionStatus: "failed",
      preview: "PDF uploaded, but text extraction failed in this environment."
    };
  }
}

async function extractDocx(buffer: Buffer): Promise<ExtractionResult> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = cleanExtractedText(result.value || "");

    if (!text) {
      return {
        extractionStatus: "partial",
        preview: "DOCX uploaded. Text extraction returned very little usable text."
      };
    }

    return {
      extractedText: truncate(text, 9000),
      extractionStatus: result.messages.length ? "partial" : "parsed",
      headings: inferHeadings(text),
      preview: buildPreview(text)
    };
  } catch {
    return {
      extractionStatus: "failed",
      preview: "DOCX uploaded, but text extraction failed in this environment."
    };
  }
}

async function extractImage(filePath?: string): Promise<ExtractionResult> {
  if (!filePath) {
    return {
      extractionStatus: "none",
      preview: "Image uploaded. OCR is unavailable because the local file path was not provided."
    };
  }

  try {
    const scriptPath = `${process.cwd()}/scripts/ocr.swift`;
    const { stdout } = await execFileAsync("swift", [scriptPath, filePath], {
      maxBuffer: 1024 * 1024 * 4,
      env: {
        ...process.env,
        CLANG_MODULE_CACHE_PATH: "/tmp/codex-swift-clang-cache",
        SWIFT_MODULECACHE_PATH: "/tmp/codex-swift-module-cache"
      }
    });
    const text = cleanExtractedText(stdout || "");

    if (!text) {
      return {
        extractionStatus: "partial",
        preview: "Image uploaded. OCR ran, but no usable text was detected."
      };
    }

    return {
      extractedText: truncate(text, 9000),
      extractionStatus: "parsed",
      headings: inferHeadings(text),
      preview: buildPreview(text)
    };
  } catch {
    return {
      extractionStatus: "failed",
      preview: "Image uploaded, but OCR failed in this environment."
    };
  }
}

export async function extractUploadContent(kind: UploadKind, buffer: Buffer, options: ExtractionOptions = {}): Promise<ExtractionResult> {
  if (kind === "csv" || kind === "text") {
    const text = cleanExtractedText(buffer.toString("utf8"));
    return {
      extractedText: truncate(text, 9000),
      extractionStatus: "parsed",
      headings: inferHeadings(text),
      preview: buildPreview(text)
    };
  }

  if (kind === "pdf") {
    return extractPdf(buffer);
  }

  if (kind === "docx") {
    return extractDocx(buffer);
  }

  if (kind === "image") {
    return extractImage(options.filePath);
  }

  return {
    extractionStatus: "none",
    preview: "File uploaded. No structured text extraction is configured for this file type yet."
  };
}
