'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Upload,
  RefreshCw,
  Github,
  BarChart3,
  ArrowLeft,
  Users,
  MessageSquare,
  FileText,
  Download,
  Clock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Wand2,
  Trash2,
  RotateCw,
  LogOut,
} from 'lucide-react';

const DEV_TOKEN = 'dev-bypass-token';

interface DocRow {
  id: string;
  title: string;
  docType: string;
  source: string;
  status: string;
  tags?: string[];
  createdAt?: string;
}

type LogKind = 'info' | 'success' | 'error';
interface LogLine {
  ts: string;
  kind: LogKind;
  msg: string;
}

export default function AdminPage() {
  // The API's JwtAuthGuard is a dev bypass, so a placeholder token is enough
  // to use the console. Logging in swaps in a real JWT if you have one.
  const [token, setToken] = useState<string>(DEV_TOKEN);
  const [email, setEmail] = useState('admin@ashishpokhrel.dev');
  const [password, setPassword] = useState('');
  const [log, setLog] = useState<LogLine[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, number> | null>(null);
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const push = useCallback((msg: string, kind: LogKind = 'info') => {
    setLog((l) =>
      [{ ts: new Date().toLocaleTimeString(), kind, msg }, ...l].slice(0, 30),
    );
  }, []);

  const authHeader = useCallback(
    () => ({ Authorization: `Bearer ${token}` }),
    [token],
  );

  /** fetch wrapper that always extracts a useful error message from the body. */
  const api = useCallback(
    async <T,>(
      path: string,
      init?: RequestInit,
    ): Promise<{ ok: boolean; data?: T; error?: string }> => {
      try {
        const res = await fetch(`/api/v1${path}`, {
          ...init,
          headers: { ...(init?.headers ?? {}), ...authHeader() },
        });
        const text = await res.text();
        let body: unknown;
        try {
          body = text ? JSON.parse(text) : undefined;
        } catch {
          body = text;
        }
        if (!res.ok) {
          const message =
            (body as { message?: string })?.message ??
            ((typeof body === 'string' && body) || `HTTP ${res.status}`);
          return { ok: false, error: String(message) };
        }
        return { ok: true, data: body as T };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
      }
    },
    [authHeader],
  );

  const loadDocs = useCallback(async () => {
    const r = await api<DocRow[]>('/documents');
    if (r.ok && Array.isArray(r.data)) setDocs(r.data);
    else if (!r.ok) push(`Failed to load documents: ${r.error}`, 'error');
  }, [api, push]);

  const loadAnalytics = useCallback(async () => {
    const r = await api<Record<string, number>>('/analytics');
    if (r.ok) {
      setAnalytics(r.data ?? null);
      push('Analytics refreshed.', 'success');
    } else {
      push(`Analytics failed: ${r.error}`, 'error');
    }
  }, [api, push]);

  useEffect(() => {
    void loadDocs();
    void loadAnalytics();
  }, [loadDocs, loadAnalytics]);

  async function login() {
    const r = await api<{ accessToken: string }>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (r.ok && r.data?.accessToken) {
      setToken(r.data.accessToken);
      push('Login successful.', 'success');
    } else {
      push(`Login failed: ${r.error ?? 'invalid credentials'}`, 'error');
    }
  }

  function logout() {
    setToken('');
    setAnalytics(null);
    push('Signed out.', 'info');
  }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setUploading(true);
    const form = new FormData(e.currentTarget);
    const r = await api<{ id: string; status: string }>('/documents/upload', {
      method: 'POST',
      body: form,
    });
    setUploading(false);
    if (r.ok) {
      push('Document uploaded and queued for ingestion.', 'success');
      (e.target as HTMLFormElement).reset();
      void loadDocs();
    } else {
      push(`Upload failed: ${r.error}`, 'error');
    }
  }

  async function syncGithub() {
    setBusy('github');
    push('Triggering GitHub sync…');
    const r = await api<{ indexed: number }>('/github/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    setBusy(null);
    if (r.ok) {
      push(`GitHub sync complete — ${r.data?.indexed ?? 0} repos indexed.`, 'success');
      void loadDocs();
    } else {
      push(`GitHub sync failed: ${r.error}`, 'error');
    }
  }

  async function reindexAll() {
    setBusy('reindex');
    push('Re-indexing knowledge base…');
    const r = await api('/embeddings/index', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    setBusy(null);
    push(
      r.ok ? 'Re-index triggered.' : `Re-index failed: ${r.error}`,
      r.ok ? 'success' : 'error',
    );
  }

  async function extractSkills() {
    setBusy('skills');
    push('Extracting skills from GitHub + resume…');
    const r = await api<{ results: { source: string; created: number; updated: number; note?: string }[] }>(
      '/skills/extract',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sources: ['github', 'resume'] }),
      },
    );
    setBusy(null);
    if (r.ok && r.data?.results) {
      for (const res of r.data.results) {
        const detail = res.note
          ? res.note
          : `+${res.created} new, ${res.updated} updated`;
        push(`Skills (${res.source}): ${detail}`, res.note ? 'info' : 'success');
      }
    } else {
      push(`Skills extraction failed: ${r.error}`, 'error');
    }
  }

  async function reindexDoc(id: string) {
    setBusy(`doc-${id}`);
    const r = await api(`/documents/${id}/reindex`, { method: 'POST' });
    setBusy(null);
    push(r.ok ? 'Document re-queued for ingestion.' : `Reindex failed: ${r.error}`, r.ok ? 'success' : 'error');
    void loadDocs();
  }

  async function deleteDoc(id: string, title: string) {
    setBusy(`doc-${id}`);
    const r = await api(`/documents/${id}`, { method: 'DELETE' });
    setBusy(null);
    push(r.ok ? `Deleted "${title}".` : `Delete failed: ${r.error}`, r.ok ? 'success' : 'error');
    void loadDocs();
  }

  // ---------- Login screen ----------
  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
        <div className="space-y-2 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-500/30 bg-indigo-500/20 text-indigo-400">
            <Sparkles size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Console</h1>
          <p className="text-xs text-slate-400">Sign in to manage the RAG knowledge base</p>
        </div>

        <div className="glass-card space-y-3 rounded-2xl p-5 shadow-glass">
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email address"
          />
          <input
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && void login()}
            placeholder="Password"
          />
          <button
            onClick={() => void login()}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 py-2.5 text-sm font-semibold text-white shadow-glow transition hover:opacity-95"
          >
            Sign In
          </button>
          <button
            onClick={() => setToken(DEV_TOKEN)}
            className="w-full rounded-xl border border-white/10 py-2 text-xs text-slate-400 transition hover:bg-white/5 hover:text-white"
          >
            Continue in dev mode
          </button>
        </div>

        {log.map((l, i) => (
          <p key={i} className="text-center font-mono text-xs text-slate-400">
            {l.msg}
          </p>
        ))}
      </main>
    );
  }

  // ---------- Dashboard ----------
  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/10 bg-slate-900/60 text-slate-300 transition hover:bg-white/10 hover:text-white"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Admin Console</h1>
            <p className="text-xs text-slate-400">Knowledge Base Ingestion &amp; RAG Operations</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadAnalytics()}
            className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/20"
          >
            <BarChart3 size={15} /> Refresh Stats
          </button>
          <button
            onClick={logout}
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-slate-300 transition hover:bg-white/10 hover:text-white"
            title="Sign out"
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {analytics && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard icon={Users} label="Visitors" value={analytics.visitors} color="text-indigo-400" />
          <StatCard icon={MessageSquare} label="Questions" value={analytics.questions} color="text-cyan-400" />
          <StatCard icon={FileText} label="Chats" value={analytics.conversations} color="text-pink-400" />
          <StatCard icon={Download} label="Downloads" value={analytics.resumeDownloads} color="text-emerald-400" />
          <StatCard icon={Clock} label="Avg Chat" value={analytics.avgChatLength} color="text-amber-400" />
        </section>
      )}

      {/* Upload */}
      <section className="glass-card space-y-4 rounded-2xl p-6 shadow-glass">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <Upload className="text-cyan-400" size={20} />
          <div>
            <h2 className="font-semibold text-white">Upload Knowledge Document</h2>
            <p className="text-xs text-slate-400">Ingest PDF, DOCX, or text files into pgvector embeddings</p>
          </div>
        </div>

        <form onSubmit={upload} className="space-y-4">
          <div className="rounded-xl border border-dashed border-white/20 bg-slate-950/60 p-4 text-center">
            <input name="file" type="file" required className="block w-full text-xs text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-indigo-300 hover:file:bg-indigo-500/30" />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input name="title" placeholder="Document Title (e.g. Master Resume 2026)" className="rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            <select name="docType" className="rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500">
              {['RESUME', 'PROJECT', 'CERTIFICATE', 'BLOG', 'EXPERIENCE', 'OTHER'].map((t) => (
                <option key={t} value={t} className="bg-slate-900 text-white">{t}</option>
              ))}
            </select>
          </div>
          <input name="tags" placeholder="Tags (comma-separated: e.g. RAG, NestJS, Python)" className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500" />
          <button type="submit" disabled={uploading} className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2.5 text-xs font-semibold text-white shadow-glow hover:opacity-95 disabled:opacity-50">
            {uploading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload &amp; Start Ingestion
          </button>
        </form>
      </section>

      {/* Quick actions */}
      <section className="glass-card grid grid-cols-1 gap-3 rounded-2xl p-5 sm:grid-cols-3">
        <ActionButton onClick={() => void syncGithub()} busy={busy === 'github'} icon={Github} title="Sync GitHub" subtitle="Fetch & embed repos" accent="cyan" />
        <ActionButton onClick={() => void extractSkills()} busy={busy === 'skills'} icon={Wand2} title="Extract Skills" subtitle="From GitHub + resume" accent="violet" />
        <ActionButton onClick={() => void reindexAll()} busy={busy === 'reindex'} icon={RefreshCw} title="Re-index KB" subtitle="Rebuild embeddings" accent="indigo" />
      </section>

      {/* Documents */}
      <section className="glass-card space-y-3 rounded-2xl p-5 shadow-glass">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <FileText className="text-indigo-400" size={18} />
            <h2 className="font-semibold text-white">Documents <span className="text-xs font-normal text-slate-500">({docs.length})</span></h2>
          </div>
          <button onClick={() => void loadDocs()} className="rounded-lg border border-white/10 px-2.5 py-1 text-[11px] text-slate-300 transition hover:bg-white/10">Refresh</button>
        </div>
        {docs.length === 0 ? (
          <p className="py-4 text-center text-xs text-slate-500">No documents yet. Upload one or sync GitHub.</p>
        ) : (
          <div className="space-y-1.5">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-medium text-slate-200">{d.title}</p>
                  <p className="text-[10px] text-slate-500">{d.docType} · {d.source}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <StatusBadge status={d.status} />
                  <button onClick={() => void reindexDoc(d.id)} disabled={busy === `doc-${d.id}`} title="Re-index" className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-white/10 hover:text-cyan-300 disabled:opacity-40">
                    <RotateCw size={13} className={busy === `doc-${d.id}` ? 'animate-spin' : ''} />
                  </button>
                  <button onClick={() => void deleteDoc(d.id, d.title)} disabled={busy === `doc-${d.id}`} title="Delete" className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Log */}
      <section className="glass-card space-y-2 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Event Activity Console
        </div>
        <div className="h-40 space-y-1 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-[11px]">
          {log.length === 0 ? (
            <p className="text-slate-600">No events logged yet.</p>
          ) : (
            log.map((l, i) => (
              <p key={i} className="flex items-start gap-1.5">
                {l.kind === 'success' && <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-emerald-400" />}
                {l.kind === 'error' && <AlertCircle size={12} className="mt-0.5 shrink-0 text-red-400" />}
                <span className={l.kind === 'error' ? 'text-red-300' : l.kind === 'success' ? 'text-emerald-200' : 'text-slate-300'}>
                  [{l.ts}] {l.msg}
                </span>
              </p>
            ))
          )}
        </div>
      </section>
    </main>
  );
}

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: any; color: string }) {
  return (
    <div className="glass-card flex flex-col justify-between rounded-xl p-3.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-slate-400">{label}</span>
        <Icon size={14} className={color} />
      </div>
      <p className="mt-2 text-xl font-bold text-white">{value ?? 0}</p>
    </div>
  );
}

function ActionButton({
  onClick,
  busy,
  icon: Icon,
  title,
  subtitle,
  accent,
}: {
  onClick: () => void;
  busy: boolean;
  icon: any;
  title: string;
  subtitle: string;
  accent: 'cyan' | 'violet' | 'indigo';
}) {
  const ring = {
    cyan: 'hover:border-cyan-500/40 hover:bg-cyan-500/10',
    violet: 'hover:border-violet-500/40 hover:bg-violet-500/10',
    indigo: 'hover:border-indigo-500/40 hover:bg-indigo-500/10',
  }[accent];
  const iconBg = {
    cyan: 'bg-cyan-500/20 text-cyan-400',
    violet: 'bg-violet-500/20 text-violet-400',
    indigo: 'bg-indigo-500/20 text-indigo-400',
  }[accent];
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={`flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition disabled:opacity-60 ${ring}`}
    >
      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconBg}`}>
        {busy ? <RefreshCw size={18} className="animate-spin" /> : <Icon size={20} />}
      </div>
      <div>
        <span className="block text-xs font-semibold text-white">{title}</span>
        <span className="block text-[11px] text-slate-400">{subtitle}</span>
      </div>
    </button>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    INDEXED: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300',
    PROCESSING: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    PENDING: 'border-slate-500/30 bg-slate-500/10 text-slate-300',
    FAILED: 'border-red-500/30 bg-red-500/10 text-red-300',
  };
  return (
    <span className={`rounded-md border px-1.5 py-0.5 font-mono text-[10px] uppercase ${map[status] ?? map.PENDING}`}>
      {status}
    </span>
  );
}
