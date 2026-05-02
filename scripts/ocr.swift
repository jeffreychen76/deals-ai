import AppKit
import Foundation
import Vision

guard CommandLine.arguments.count >= 2 else {
  fputs("Usage: ocr.swift <image-path>\n", stderr)
  exit(1)
}

let imagePath = CommandLine.arguments[1]

guard let image = NSImage(contentsOfFile: imagePath) else {
  fputs("Could not open image at path: \(imagePath)\n", stderr)
  exit(2)
}

var proposedRect = NSRect(origin: .zero, size: image.size)

guard let cgImage = image.cgImage(forProposedRect: &proposedRect, context: nil, hints: nil) else {
  fputs("Could not convert image to CGImage.\n", stderr)
  exit(3)
}

let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = true
request.recognitionLanguages = ["en-US", "zh-Hans", "zh-Hant"]

let handler = VNImageRequestHandler(cgImage: cgImage, options: [:])

do {
  try handler.perform([request])
  let text = request.results?
    .compactMap { observation in
      observation.topCandidates(1).first?.string
    }
    .joined(separator: "\n") ?? ""
  print(text)
} catch {
  fputs("OCR failed: \(error.localizedDescription)\n", stderr)
  exit(4)
}
