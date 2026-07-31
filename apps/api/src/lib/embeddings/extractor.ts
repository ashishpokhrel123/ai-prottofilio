import { extname } from "node:path";
import {
  UnsupportedOperationError,
  errorMessage,
} from "../../core/errors/domain.errors";

/**
 * Text extraction from an in-memory buffer.
 *
 * Buffer-based rather than path-based on purpose: it decouples extraction from
 * the filesystem, so the same code works against local disk, S3 or any other
 * `FileStoragePort` implementation, and it is trivially unit-testable.
 *
 * Heavy parsers (pdf, docx, OCR) are imported lazily — `tesseract.js` alone
 * pulls in tens of megabytes, and most deployments never OCR anything.
 */

export type SupportedExtension =
  | ".txt"
  | ".md"
  | ".json"
  | ".csv"
  | ".pdf"
  | ".docx"
  | ".png"
  | ".jpg"
  | ".jpeg"
  | ".webp";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

export async function extractText(
  buffer: Buffer,
  filename: string,
  mimeType?: string,
): Promise<string> {
  const ext = extname(filename).toLowerCase();

  try {
    if (ext === ".txt" || ext === ".md" || mimeType?.startsWith("text/")) {
      return buffer.toString("utf8");
    }

    if (ext === ".json")
      return flattenJson(JSON.parse(buffer.toString("utf8")));
    if (ext === ".csv") return csvToText(buffer.toString("utf8"));
    if (ext === ".pdf") return await extractPdf(buffer);
    if (ext === ".docx") return await extractDocx(buffer);
    if (IMAGE_EXTENSIONS.has(ext)) return await extractImage(buffer);
  } catch (err) {
    throw new UnsupportedOperationError(
      `Could not extract text from "${filename}": ${errorMessage(err)}`,
      { extension: ext },
    );
  }

  throw new UnsupportedOperationError(
    `Unsupported file type "${ext || "(none)"}".`,
    { extension: ext },
  );
}

async function extractPdf(buffer: Buffer): Promise<string> {
  const { default: pdfParse } = await import("pdf-parse");
  return (await pdfParse(buffer)).text;
}

async function extractDocx(buffer: Buffer): Promise<string> {
  const mammoth = await import("mammoth");
  return (await mammoth.extractRawText({ buffer })).value;
}

async function extractImage(buffer: Buffer): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(buffer);
    return data.text;
  } finally {
    // Each worker holds a native process; leaking one leaks memory per upload.
    await worker.terminate();
  }
}

function csvToText(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.split(",").join(" | "))
    .join("\n");
}

/**
 * Flattens arbitrary JSON into `path: value` lines.
 *
 * Embedding raw JSON wastes tokens on punctuation and retrieves poorly; a flat
 * path-value rendering keeps the semantic content and drops the syntax.
 */
function flattenJson(value: unknown, prefix = ""): string {
  if (value === null || value === undefined) return "";
  if (typeof value !== "object") return `${prefix}: ${String(value)}\n`;

  if (Array.isArray(value)) {
    return value.map((item) => flattenJson(item, prefix)).join("");
  }

  return Object.entries(value as Record<string, unknown>)
    .map(([key, val]) => flattenJson(val, prefix ? `${prefix}.${key}` : key))
    .join("");
}
