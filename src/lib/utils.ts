export function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

export function nowIso() {
  return new Date().toISOString();
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function truncate(input: string, size = 180) {
  if (input.length <= size) {
    return input;
  }
  return `${input.slice(0, size - 3)}...`;
}

export function linesToParagraphs(content: string) {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
