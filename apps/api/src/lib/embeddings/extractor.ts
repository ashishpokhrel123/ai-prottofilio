import { readFile } from "node:fs/promises";
import { extname } from "node:path";

/**
 * Extract clean text from a supported file. Heavy parsers are imported
 * lazily so the API process doesn't pay for them unless a file needs it.
 */
export async function extractText(
  filePath: string,
  mimeType?: string,
): Promise<string> {
  const ext = extname(filePath).toLowerCase();

  if (ext === ".txt" || ext === ".md" || mimeType?.startsWith("text/")) {
    return (await readFile(filePath, "utf8")).toString();
  }

  if (ext === ".json") {
    const json = JSON.parse(await readFile(filePath, "utf8"));
    return flattenJson(json);
  }

  if (ext === ".csv") {
    const raw = (await readFile(filePath, "utf8")).toString();
    return raw
      .split("\n")
      .map((l) => l.replace(/,/g, " | "))
      .join("\n");
  }

  if (ext === ".pdf") {
    const pdfParse = (await import("pdf-parse")).default;
    const buf = await readFile(filePath);
    return (await pdfParse(buf)).text;
  }

  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const buf = await readFile(filePath);
    return (await mammoth.extractRawText({ buffer: buf })).value;
  }

  if ([".png", ".jpg", ".jpeg", ".webp"].includes(ext)) {
    const { createWorker } = await import("tesseract.js");
    const worker = await createWorker("eng");
    const { data } = await worker.recognize(filePath);
    await worker.terminate();
    return data.text;
  }

  throw new Error(`Unsupported file type: ${ext}`);
}

function flattenJson(value: unknown, prefix = ""): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return `${prefix}: ${String(value)}\n`;
  if (Array.isArray(value))
    return value.map((v) => flattenJson(v, prefix)).join("");
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => flattenJson(v, prefix ? `${prefix}.${k}` : k))
    .join("");
}
