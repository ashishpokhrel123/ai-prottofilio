import { Injectable, Logger } from "@nestjs/common";
import { join } from "node:path";
import { readdir } from "node:fs/promises";
import { PrismaService } from "../../common/config/prisma.service";
import { GeminiService } from "../../lib/llm/gemini.service";
import { extractText } from "../../lib/embeddings/extractor";

interface SkillCandidate {
  name: string;
  category: string;
  level: number; // 1..5
  years?: number | null;
}

export interface ExtractionResult {
  source: "github" | "resume";
  created: number;
  updated: number;
  note?: string;
}

const CATEGORIES =
  "Languages, Frontend, Backend, AI/ML, Cloud, DevOps, Databases, Tools & Frameworks, Other";

const SKILLS_EXTRACTION_SYSTEM = `You extract a candidate's technical skills from their resume text.
Return ONLY a JSON array — no prose, no markdown fences. Each item:
{ "name": string, "category": one of [${CATEGORIES}], "level": integer 1-5, "years": number or null }
Rules:
- "level" reflects emphasis/seniority in the resume (1 = mentioned once, 5 = core expertise).
- Prefer canonical names ("TypeScript" not "TS", "PostgreSQL" not "postgres").
- Only real, concrete technical skills (languages, frameworks, tools, platforms, databases). No soft skills.
- Deduplicate. Max ~40 items.`;

/** Maps a GitHub language to a Skill category. */
function categoryForLanguage(lang: string): string {
  const l = lang.toLowerCase();
  if (["sql", "plpgsql", "tsql"].includes(l)) return "Databases";
  if (["html", "css", "scss", "vue", "svelte"].includes(l)) return "Frontend";
  if (["dockerfile", "shell", "makefile", "hcl"].includes(l)) return "DevOps";
  if (["jupyter notebook", "python"].includes(l)) return "AI/ML";
  return "Languages";
}

/** Repo frequency → a rough proficiency level. */
function levelFromCount(count: number): number {
  if (count >= 4) return 5;
  if (count >= 2) return 4;
  return 3;
}

function prettifyTopic(topic: string): string {
  return topic
    .split(/[-_]/)
    .map((w) => (w.length <= 3 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(" ");
}

/**
 * Derives Skill records from two evidence sources — synced GitHub repos
 * (languages + topics) and the resume (via Gemini) — and merges them into the
 * Skill table. Merge semantics: never delete; add new skills and raise
 * level/years when the new evidence is stronger.
 */
@Injectable()
export class SkillsExtractionService {
  private readonly logger = new Logger(SkillsExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gemini: GeminiService,
  ) {}

  async extractAll(): Promise<ExtractionResult[]> {
    return [await this.extractFromGithub(), await this.extractFromResume()];
  }

  /** Aggregate languages + topics from synced GITHUB documents. */
  async extractFromGithub(): Promise<ExtractionResult> {
    const docs = await this.prisma.document.findMany({
      where: { source: "GITHUB" },
      select: { metadata: true },
    });
    if (docs.length === 0) {
      return {
        source: "github",
        created: 0,
        updated: 0,
        note: "No GitHub repos synced yet — run POST /api/v1/github/sync first.",
      };
    }

    const langCount = new Map<string, number>();
    const topicCount = new Map<string, number>();
    for (const d of docs) {
      const m = (d.metadata as Record<string, unknown> | null) ?? {};
      const lang = m.language as string | null;
      if (lang) langCount.set(lang, (langCount.get(lang) ?? 0) + 1);
      for (const t of (m.topics as string[] | undefined) ?? [])
        topicCount.set(t, (topicCount.get(t) ?? 0) + 1);
    }

    const candidates: SkillCandidate[] = [];
    for (const [lang, count] of langCount)
      candidates.push({
        name: lang,
        category: categoryForLanguage(lang),
        level: levelFromCount(count),
      });
    for (const [topic, count] of topicCount)
      candidates.push({
        name: prettifyTopic(topic),
        category: "Tools & Frameworks",
        level: Math.min(5, 2 + count),
      });

    const { created, updated } = await this.upsert(candidates);
    return { source: "github", created, updated };
  }

  /** Extract skills from the resume text via Gemini. */
  async extractFromResume(): Promise<ExtractionResult> {
    const text = await this.resumeText();
    if (!text || text.length < 30) {
      return {
        source: "resume",
        created: 0,
        updated: 0,
        note: "No resume found. Upload a resume (docType RESUME) in the admin panel first.",
      };
    }

    const raw = await this.gemini.complete(SKILLS_EXTRACTION_SYSTEM, [
      { role: "user", content: text.slice(0, 12000) },
    ]);
    const parsed = this.parseSkills(raw);
    if (parsed.length === 0) {
      return {
        source: "resume",
        created: 0,
        updated: 0,
        note: "Could not extract skills from the resume (is GEMINI_API_KEY set and valid?).",
      };
    }

    const { created, updated } = await this.upsert(parsed);
    return { source: "resume", created, updated };
  }

  /** Resolve the resume's raw text: uploaded doc first, then knowledge/resume. */
  private async resumeText(): Promise<string> {
    const doc = await this.prisma.document.findFirst({
      where: {
        filePath: { not: null },
        OR: [
          { docType: "RESUME" },
          { title: { contains: "resume", mode: "insensitive" } },
        ],
      },
      orderBy: { updatedAt: "desc" },
      select: { filePath: true, mimeType: true },
    });
    if (doc?.filePath) {
      try {
        return await extractText(doc.filePath, doc.mimeType ?? undefined);
      } catch (err) {
        this.logger.warn(`resume extractText failed: ${String(err)}`);
      }
    }
    try {
      const dir = join(process.cwd(), "knowledge", "resume");
      const pdf = (await readdir(dir)).find((f) =>
        f.toLowerCase().endsWith(".pdf"),
      );
      if (pdf) return await extractText(join(dir, pdf));
    } catch {
      /* no static resume */
    }
    return "";
  }

  /** Merge candidates into the Skill table (upsert; never deletes). */
  private async upsert(
    candidates: SkillCandidate[],
  ): Promise<{ created: number; updated: number }> {
    const existing = await this.prisma.skill.findMany();
    const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));
    let created = 0;
    let updated = 0;

    for (const c of candidates) {
      const name = c.name.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      const level = Math.min(5, Math.max(1, Math.round(c.level || 3)));
      const prev = byName.get(key);

      if (prev) {
        const nextLevel = Math.max(prev.level, level);
        const nextYears =
          Math.max(prev.years ?? 0, c.years ?? 0) || prev.years || null;
        if (nextLevel !== prev.level || (nextYears ?? 0) !== (prev.years ?? 0)) {
          await this.prisma.skill.update({
            where: { id: prev.id },
            data: { level: nextLevel, years: nextYears ?? undefined },
          });
          updated += 1;
        }
      } else {
        const row = await this.prisma.skill.create({
          data: {
            name,
            category: c.category || "Other",
            level,
            years: c.years ?? undefined,
          },
        });
        byName.set(key, row); // dedupe within this run
        created += 1;
      }
    }
    return { created, updated };
  }

  private parseSkills(raw: string): SkillCandidate[] {
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) return [];
      const arr = JSON.parse(match[0]) as unknown[];
      return arr
        .filter((x): x is Record<string, unknown> => !!x && typeof x === "object")
        .map((x) => ({
          name: String(x.name ?? "").trim(),
          category: String(x.category ?? "Other").trim() || "Other",
          level: Number(x.level ?? 3),
          years:
            x.years === null || x.years === undefined ? null : Number(x.years),
        }))
        .filter((s) => s.name.length > 0);
    } catch {
      return [];
    }
  }
}
