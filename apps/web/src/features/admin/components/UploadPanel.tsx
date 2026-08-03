"use client";

import { useRef, type FormEvent } from "react";
import { Loader2, Upload } from "lucide-react";

const DOC_TYPES = [
  "RESUME",
  "PROJECT",
  "CERTIFICATE",
  "BLOG",
  "EXPERIENCE",
  "EDUCATION",
  "SKILL",
  "README",
  "OTHER",
] as const;

/** Must match the extensions the API's storage adapter accepts. */
const ACCEPTED = ".txt,.md,.json,.csv,.pdf,.docx,.png,.jpg,.jpeg,.webp";

interface UploadPanelProps {
  onUpload: (form: FormData) => Promise<void>;
  isUploading: boolean;
}

export function UploadPanel({ onUpload, isUploading }: UploadPanelProps) {
  const formRef = useRef<HTMLFormElement>(null);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);

    // Empty optional fields would fail the API's validation pipe, which runs
    // with forbidNonWhitelisted — strip them rather than send blanks.
    for (const [key, value] of [...form.entries()]) {
      if (typeof value === "string" && value.trim() === "") form.delete(key);
    }

    await onUpload(form);
    formRef.current?.reset();
  };

  return (
    <section className="panel space-y-4 p-6 shadow-raised">
      <div className="flex items-center gap-2 border-b border-panel-line pb-3">
        <Upload className="text-signal" size={20} aria-hidden="true" />
        <div>
          <h2 className="font-semibold text-zinc-100">
            Upload knowledge document
          </h2>
          <p className="text-xs text-zinc-400">
            PDF, DOCX, or text files are chunked and embedded into pgvector
          </p>
        </div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="border border-dashed border-panel-line bg-panel-sunken p-4">
          <label htmlFor="file" className="sr-only">
            Document file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept={ACCEPTED}
            className="block w-full text-xs text-zinc-400 file:mr-4 file: file:border-0 file:bg-signal/20 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-signal hover:file:bg-signal/30"
          />
          <p className="mt-2 text-[11px] text-zinc-500">Maximum 25 MB.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="title" className="sr-only">
              Document title
            </label>
            <input
              id="title"
              name="title"
              placeholder="Title (defaults to the filename)"
              className="w-full border border-panel-line bg-panel-sunken px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-signal"
            />
          </div>

          <div>
            <label htmlFor="docType" className="sr-only">
              Document type
            </label>
            <select
              id="docType"
              name="docType"
              defaultValue="OTHER"
              className="w-full border border-panel-line bg-panel-sunken px-3.5 py-2 text-xs text-zinc-200 focus:outline-none focus:ring-1 focus:ring-signal"
            >
              {DOC_TYPES.map((type) => (
                <option
                  key={type}
                  value={type}
                  className="bg-panel text-zinc-100"
                >
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="tags" className="sr-only">
            Tags
          </label>
          <input
            id="tags"
            name="tags"
            placeholder="Tags, comma-separated (e.g. RAG, NestJS, Python)"
            className="w-full border border-panel-line bg-panel-sunken px-3.5 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-signal"
          />
        </div>

        <button
          type="submit"
          disabled={isUploading}
          className="flex items-center justify-center gap-2 bg-signal px-5 py-2.5 text-xs font-semibold text-white shadow-raised transition hover:opacity-95 disabled:opacity-50"
        >
          {isUploading ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <Upload size={14} aria-hidden="true" />
          )}
          {isUploading ? "Uploading…" : "Upload and start ingestion"}
        </button>
      </form>
    </section>
  );
}
