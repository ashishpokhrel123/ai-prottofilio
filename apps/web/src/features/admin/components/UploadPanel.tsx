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
    <section className="glass-card space-y-4 rounded-2xl p-6 shadow-glass">
      <div className="flex items-center gap-2 border-b border-white/10 pb-3">
        <Upload className="text-cyan-400" size={20} aria-hidden="true" />
        <div>
          <h2 className="font-semibold text-white">
            Upload knowledge document
          </h2>
          <p className="text-xs text-slate-400">
            PDF, DOCX, or text files are chunked and embedded into pgvector
          </p>
        </div>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-dashed border-white/20 bg-slate-950/60 p-4">
          <label htmlFor="file" className="sr-only">
            Document file
          </label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept={ACCEPTED}
            className="block w-full text-xs text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-indigo-300 hover:file:bg-indigo-500/30"
          />
          <p className="mt-2 text-[11px] text-slate-500">Maximum 25 MB.</p>
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
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
              className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {DOC_TYPES.map((type) => (
                <option
                  key={type}
                  value={type}
                  className="bg-slate-900 text-white"
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
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <button
          type="submit"
          disabled={isUploading}
          className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2.5 text-xs font-semibold text-white shadow-glow transition hover:opacity-95 disabled:opacity-50"
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
