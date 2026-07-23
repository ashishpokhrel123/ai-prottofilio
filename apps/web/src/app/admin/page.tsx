'use client';

import { useState } from 'react';
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
} from 'lucide-react';

export default function AdminPage() {
  const [token, setToken] = useState<string>('dev-bypass-token');
  const [email, setEmail] = useState('admin@ashishpokhrel.dev');
  const [password, setPassword] = useState('');
  const [log, setLog] = useState<string[]>([]);
  const [analytics, setAnalytics] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const push = (m: string) => setLog((l) => [`[${new Date().toLocaleTimeString()}] ${m}`, ...l].slice(0, 20));
  const auth = { Authorization: `Bearer ${token}` };

  async function login() {
    const res = await fetch('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) return push('Login failed — invalid credentials.');
    const data = await res.json();
    setToken(data.accessToken);
    push('Login successful.');
  }

  async function upload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const form = new FormData(e.currentTarget);
    const res = await fetch('/api/v1/documents/upload', { method: 'POST', headers: auth, body: form });
    setLoading(false);
    push(res.ok ? 'Document uploaded and queued for RAG ingestion.' : 'Upload failed.');
  }

  async function post(path: string, label: string) {
    push(`Triggering ${label}…`);
    const res = await fetch(`/api/v1${path}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: '{}',
    });
    push(`${label}: ${res.ok ? 'success' : 'failed'}`);
  }

  async function loadAnalytics() {
    const res = await fetch('/api/v1/analytics', { headers: auth });
    if (res.ok) {
      setAnalytics(await res.json());
      push('Analytics metrics refreshed.');
    } else {
      push('Failed to fetch analytics.');
    }
  }

  if (!token) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-4">
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
            <Sparkles size={24} />
          </div>
          <h1 className="text-2xl font-bold text-white">Admin Console</h1>
          <p className="text-xs text-slate-400">Sign in to manage RAG knowledge base</p>
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
            placeholder="Password"
          />
          <button
            onClick={login}
            className="w-full rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 py-2.5 text-sm font-semibold text-white shadow-glow hover:opacity-95 transition"
          >
            Sign In
          </button>
        </div>

        {log.map((l, i) => (
          <p key={i} className="text-center text-xs font-mono text-slate-400">
            {l}
          </p>
        ))}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      {/* Admin Header */}
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

        <button
          onClick={loadAnalytics}
          className="flex items-center gap-2 rounded-xl border border-indigo-500/30 bg-indigo-500/10 px-3.5 py-2 text-xs font-medium text-indigo-300 transition hover:bg-indigo-500/20"
        >
          <BarChart3 size={15} /> Refresh Stats
        </button>
      </div>

      {/* Analytics Grid */}
      {analytics && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <StatCard icon={Users} label="Visitors" value={analytics.visitors} color="text-indigo-400" />
          <StatCard icon={MessageSquare} label="Questions" value={analytics.questions} color="text-cyan-400" />
          <StatCard icon={FileText} label="Chats" value={analytics.conversations} color="text-pink-400" />
          <StatCard icon={Download} label="Downloads" value={analytics.resumeDownloads} color="text-emerald-400" />
          <StatCard icon={Clock} label="Avg Chat" value={analytics.avgChatLength} color="text-amber-400" />
        </section>
      )}

      {/* Document Upload Section */}
      <section className="glass-card rounded-2xl p-6 shadow-glass space-y-4">
        <div className="flex items-center gap-2 border-b border-white/10 pb-3">
          <Upload className="text-cyan-400" size={20} />
          <div>
            <h2 className="font-semibold text-white">Upload Knowledge Document</h2>
            <p className="text-xs text-slate-400">Ingest PDF, DOCX, or text files into pgvector embeddings</p>
          </div>
        </div>

        <form onSubmit={upload} className="space-y-4">
          <div className="rounded-xl border border-dashed border-white/20 bg-slate-950/60 p-4 text-center">
            <input name="file" type="file" className="block w-full text-xs text-slate-400 file:mr-4 file:rounded-lg file:border-0 file:bg-indigo-500/20 file:px-4 file:py-2 file:text-xs file:font-semibold file:text-indigo-300 hover:file:bg-indigo-500/30" required />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <input
              name="title"
              placeholder="Document Title (e.g. Master Resume 2026)"
              className="rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <select
              name="docType"
              className="rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              {['RESUME', 'PROJECT', 'CERTIFICATE', 'BLOG', 'EXPERIENCE', 'OTHER'].map((t) => (
                <option key={t} value={t} className="bg-slate-900 text-white">
                  {t}
                </option>
              ))}
            </select>
          </div>

          <input
            name="tags"
            placeholder="Tags (comma-separated: e.g. RAG, NestJS, Python)"
            className="w-full rounded-xl border border-white/10 bg-slate-950/80 px-3.5 py-2 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-5 py-2.5 text-xs font-semibold text-white shadow-glow hover:opacity-95 disabled:opacity-50"
          >
            {loading ? <RefreshCw size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload &amp; Start Ingestion
          </button>
        </form>
      </section>

      {/* Quick Action Operations */}
      <section className="glass-card grid grid-cols-1 gap-3 rounded-2xl p-5 sm:grid-cols-2">
        <button
          onClick={() => post('/github/sync', 'GitHub Sync')}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-cyan-500/40 hover:bg-cyan-500/10"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-500/20 text-cyan-400">
            <Github size={20} />
          </div>
          <div>
            <span className="block text-xs font-semibold text-white">Sync GitHub Repositories</span>
            <span className="block text-[11px] text-slate-400">Fetch READMEs, languages &amp; stars</span>
          </div>
        </button>

        <button
          onClick={() => post('/embeddings/index', 'Re-index Knowledge Base')}
          className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-indigo-500/40 hover:bg-indigo-500/10"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-400">
            <RefreshCw size={20} />
          </div>
          <div>
            <span className="block text-xs font-semibold text-white">Re-index Knowledge Base</span>
            <span className="block text-[11px] text-slate-400">Re-generate vector embeddings</span>
          </div>
        </button>
      </section>

      {/* Terminal Log */}
      <section className="glass-card space-y-2 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-400">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          Event Activity Console
        </div>
        <div className="h-40 overflow-y-auto rounded-xl border border-white/10 bg-slate-950 p-3 font-mono text-[11px] space-y-1">
          {log.length === 0 ? (
            <p className="text-slate-600">No events logged yet.</p>
          ) : (
            log.map((l, i) => (
              <p key={i} className="text-slate-300">
                {l}
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
