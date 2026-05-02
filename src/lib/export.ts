import { Buffer } from "node:buffer";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { Artifact, ExportFormat } from "@/lib/types";
import { linesToParagraphs } from "@/lib/utils";

function markdownToPlainText(content: string) {
  return content
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/^\-\s+/gm, "• ")
    .trim();
}

async function exportDocx(artifact: Artifact) {
  const paragraphs = linesToParagraphs(artifact.content).map((line) => {
    if (line.startsWith("## ")) {
      return new Paragraph({
        spacing: { before: 240, after: 120 },
        children: [new TextRun({ text: line.replace(/^##\s+/, ""), bold: true, size: 28 })]
      });
    }

    if (line.startsWith("# ")) {
      return new Paragraph({
        spacing: { before: 320, after: 180 },
        children: [new TextRun({ text: line.replace(/^#\s+/, ""), bold: true, size: 34 })]
      });
    }

    return new Paragraph({
      spacing: { after: 120 },
      children: [new TextRun({ text: line, size: 22 })]
    });
  });

  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            spacing: { after: 260 },
            children: [new TextRun({ text: artifact.title, bold: true, size: 36 })]
          }),
          ...paragraphs
        ]
      }
    ]
  });

  return Packer.toBuffer(doc);
}

async function exportPdf(artifact: Artifact) {
  const pdf = await PDFDocument.create();
  let page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 54;
  const lineHeight = 18;
  const maxWidth = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;

  const drawLine = (line: string, options?: { bold?: boolean; size?: number }) => {
    const size = options?.size ?? 11;
    const currentFont = options?.bold ? bold : font;
    const words = line.split(/\s+/);
    let currentLine = "";

    for (const word of words) {
      const candidate = currentLine ? `${currentLine} ${word}` : word;
      const width = currentFont.widthOfTextAtSize(candidate, size);

      if (width > maxWidth && currentLine) {
        page.drawText(currentLine, {
          x: margin,
          y,
          size,
          font: currentFont,
          color: rgb(0.06, 0.13, 0.19)
        });
        y -= lineHeight;
        currentLine = word;
      } else {
        currentLine = candidate;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, {
        x: margin,
        y,
        size,
        font: currentFont,
        color: rgb(0.06, 0.13, 0.19)
      });
      y -= lineHeight;
    }

    if (y < 72) {
      page = pdf.addPage([612, 792]);
      y = page.getHeight() - margin;
    }
  };

  drawLine(artifact.title, { bold: true, size: 18 });
  y -= 8;

  for (const line of linesToParagraphs(markdownToPlainText(artifact.content))) {
    if (line.startsWith("## ")) {
      y -= 6;
      drawLine(line.replace(/^##\s+/, ""), { bold: true, size: 14 });
      continue;
    }

    if (line.startsWith("# ")) {
      y -= 8;
      drawLine(line.replace(/^#\s+/, ""), { bold: true, size: 16 });
      continue;
    }

    drawLine(line);
  }

  return Buffer.from(await pdf.save());
}

export async function exportArtifact(artifact: Artifact, format: ExportFormat) {
  if (format === "md") {
    return {
      body: Buffer.from(`# ${artifact.title}\n\n${artifact.content}`, "utf8"),
      contentType: "text/markdown; charset=utf-8",
      extension: "md"
    };
  }

  if (format === "docx") {
    return {
      body: await exportDocx(artifact),
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx"
    };
  }

  return {
    body: await exportPdf(artifact),
    contentType: "application/pdf",
    extension: "pdf"
  };
}
