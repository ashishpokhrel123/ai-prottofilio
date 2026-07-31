import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { Inject, Injectable, Logger } from "@nestjs/common";
import { z } from "zod";
import { errorMessage } from "../../core/errors/domain.errors";
import {
  FILE_STORAGE_PORT,
  LLM_PORT,
  type FileStoragePort,
  type LlmPort,
} from "../../core/ports";
import { extractText } from "../../lib/embeddings/extractor";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";

export interface ExtractionResult {
  readonly source: "github" | "resume";
  readonly created: number;
  readonly updated: number;
  readonly note?: string;
}

const CATEGORIES = [
  "Languages",
  "Frontend",
  "Backend",
  "AI/ML",
  "Cloud",
  "DevOps",
  "Databases",
  "Tools & Frameworks",
  "Other",
] as const;

const skillCandidateSchema = z.object({
  name: z.string().trim().min(1).max(60),
  category: z.string().trim().default("Other"),
  level: z.coerce.number().int().min(1).max(5).catch(3),
  years: z.coerce.number().min(0).max(60).nullable().catch(null),
});

type SkillCandidate = z.infer<typeof skillCandidateSchema>;

const MAX_RESUME_CHARS = 12_000;
const MAX_CANDIDATES = 60;

const SKILLS_EXTRACTION_SYSTEM = `You extract a candidate's technical skills from their resume text.

Return ONLY a JSON array — no prose, no markdown fences. Each item:
{ "name": string, "category": one of [${CATEGORIES.join(", ")}], "level": integer 1-5, "years": number or null }

Rules:
- "level" reflects emphasis and seniority in the resume (1 = mentioned once, 5 = core expertise).
- Prefer canonical names ("TypeScript" not "TS", "PostgreSQL" not "postgres").
- Only concrete technical skills: languages, frameworks, tools, platforms, databases. No soft skills.
- Deduplicate. At most 40 items.`;

/**
 * Derives `Skill` records from two evidence sources — synced GitHub
 * repositories (languages and topics) and the résumé (via the LLM) — and
 * merges them into the table.
 *
 * Merge semantics are additive: never delete, only insert new skills and raise
 * level/years when new evidence is stronger. A bad extraction run therefore
 * can't wipe a hand-curated skill list.
 */
@Injectable()
export class SkillsExtractionService {
  private readonly logger = new Logger(SkillsExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(LLM_PORT) private readonly llm: LlmPort,
    @Inject(FILE_STORAGE_PORT) private readonly storage: FileStoragePort,
  ) {}

  async extractAll(): Promise<ExtractionResult[]> {
    return [await this.extractFromGithub(), await this.extractFromResume()];
  }

  /** Aggregates languages and topics across synced GitHub documents. */
  async extractFromGithub(): Promise<ExtractionResult> {
    const documents = await this.prisma.document.findMany({
      where: { source: "GITHUB" },
      select: { metadata: true },
    });

    if (documents.length === 0) {
      return {
        source: "github",
        created: 0,
        updated: 0,
        note: "No GitHub repositories synced yet — run POST /api/v1/github/sync first.",
      };
    }

    const languages = new Map<string, number>();
    const topics = new Map<string, number>();

    for (const doc of documents) {
      const metadata = (doc.metadata ?? {}) as {
        language?: string | null;
        topics?: string[];
      };

      if (metadata.language) {
        languages.set(
          metadata.language,
          (languages.get(metadata.language) ?? 0) + 1,
        );
      }
      for (const topic of metadata.topics ?? []) {
        topics.set(topic, (topics.get(topic) ?? 0) + 1);
      }
    }

    const candidates: SkillCandidate[] = [
      ...[...languages].map(([name, count]) => ({
        name,
        category: categoryForLanguage(name),
        level: levelFromRepoCount(count),
        years: null,
      })),
      ...[...topics].map(([topic, count]) => ({
        name: prettifyTopic(topic),
        category: "Tools & Frameworks",
        level: Math.min(5, 2 + count),
        years: null,
      })),
    ];

    return { source: "github", ...(await this.merge(candidates)) };
  }

  /** Extracts skills from the résumé text via the configured LLM. */
  async extractFromResume(): Promise<ExtractionResult> {
    const text = await this.resumeText();

    if (text.length < 30) {
      return {
        source: "resume",
        created: 0,
        updated: 0,
        note: "No resume found. Upload one (docType RESUME) in the admin panel first.",
      };
    }

    if (!this.llm.isConfigured) {
      return {
        source: "resume",
        created: 0,
        updated: 0,
        note: "No language-model API key configured, so resume extraction is unavailable.",
      };
    }

    const raw = await this.llm.complete(
      SKILLS_EXTRACTION_SYSTEM,
      [{ role: "user", content: text.slice(0, MAX_RESUME_CHARS) }],
      { temperature: 0 },
    );

    const candidates = parseCandidates(raw);

    if (candidates.length === 0) {
      return {
        source: "resume",
        created: 0,
        updated: 0,
        note: "Could not extract any skills from the resume text.",
      };
    }

    return { source: "resume", ...(await this.merge(candidates)) };
  }

  /**
   * Resolves the résumé's raw text: the most recently uploaded résumé document
   * first, then a static PDF under `knowledge/resume/`.
   */
  private async resumeText(): Promise<string> {
    const uploaded = await this.prisma.document.findFirst({
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

    if (uploaded?.filePath) {
      try {
        const buffer = await this.storage.read(uploaded.filePath);
        return await extractText(
          buffer,
          uploaded.filePath,
          uploaded.mimeType ?? undefined,
        );
      } catch (err) {
        this.logger.warn(
          `Could not read uploaded resume, falling back to knowledge/: ${errorMessage(err)}`,
        );
      }
    }

    return this.staticResumeText();
  }

  private async staticResumeText(): Promise<string> {
    try {
      const dir = join(process.cwd(), "knowledge", "resume");
      const pdf = (await readdir(dir)).find((f) =>
        f.toLowerCase().endsWith(".pdf"),
      );
      if (!pdf) return "";

      const { readFile } = await import("node:fs/promises");
      return await extractText(await readFile(join(dir, pdf)), pdf);
    } catch {
      return "";
    }
  }

  /** Upserts candidates. Never deletes; only strengthens existing records. */
  private async merge(
    candidates: readonly SkillCandidate[],
  ): Promise<{ created: number; updated: number }> {
    const existing = await this.prisma.skill.findMany();
    const byName = new Map(existing.map((s) => [s.name.toLowerCase(), s]));

    let created = 0;
    let updated = 0;

    for (const candidate of candidates.slice(0, MAX_CANDIDATES)) {
      const name = candidate.name.trim();
      if (!name) continue;

      const key = name.toLowerCase();
      const previous = byName.get(key);

      if (!previous) {
        const row = await this.prisma.skill.create({
          data: {
            name,
            category: normalizeCategory(candidate.category),
            level: candidate.level,
            years: candidate.years ?? undefined,
          },
        });
        // Track within the run too, so two sources can't insert a duplicate.
        byName.set(key, row);
        created += 1;
        continue;
      }

      const nextLevel = Math.max(previous.level, candidate.level);
      const nextYears = Math.max(previous.years ?? 0, candidate.years ?? 0);

      const levelChanged = nextLevel !== previous.level;
      const yearsChanged = nextYears > (previous.years ?? 0);

      if (levelChanged || yearsChanged) {
        await this.prisma.skill.update({
          where: { id: previous.id },
          data: {
            level: nextLevel,
            years: nextYears > 0 ? nextYears : undefined,
          },
        });
        updated += 1;
      }
    }

    return { created, updated };
  }
}

function parseCandidates(raw: string): SkillCandidate[] {
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];

  try {
    const parsed = z
      .array(skillCandidateSchema)
      .safeParse(JSON.parse(match[0]));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function normalizeCategory(category: string): string {
  const match = CATEGORIES.find(
    (c) => c.toLowerCase() === category.trim().toLowerCase(),
  );
  return match ?? "Other";
}

/** Maps a GitHub language to a skill category. */
function categoryForLanguage(language: string): string {
  const normalized = language.toLowerCase();

  if (["sql", "plpgsql", "tsql"].includes(normalized)) return "Databases";
  if (["html", "css", "scss", "vue", "svelte"].includes(normalized)) {
    return "Frontend";
  }
  if (["dockerfile", "shell", "makefile", "hcl"].includes(normalized)) {
    return "DevOps";
  }
  if (["jupyter notebook", "python"].includes(normalized)) return "AI/ML";

  return "Languages";
}

/** Repository frequency as a rough proficiency proxy. */
function levelFromRepoCount(count: number): number {
  if (count >= 4) return 5;
  if (count >= 2) return 4;
  return 3;
}

function prettifyTopic(topic: string): string {
  return topic
    .split(/[-_]/)
    .map((word) =>
      word.length <= 3
        ? word.toUpperCase()
        : word[0].toUpperCase() + word.slice(1),
    )
    .join(" ");
}
