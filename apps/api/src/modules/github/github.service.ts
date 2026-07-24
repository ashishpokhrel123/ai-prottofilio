import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../common/config/prisma.service";
import { IngestionService } from "../../lib/embeddings/ingestion.service";

interface GhRepo {
  name: string;
  description: string | null;
  html_url: string;
  language: string | null;
  stargazers_count: number;
  topics: string[];
  fork: boolean;
}

/**
 * Fetches public repos + READMEs from the GitHub API and ingests them into
 * the vector store so the agent can answer questions about live code.
 */
@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
  ) {}

  private headers() {
    const token = this.config.get<string>("github.token");
    // Ignore the shipped placeholder so we fall back to unauthenticated
    // access (public repos still work) instead of sending a 401-guaranteed
    // "Bearer your-github-pat".
    const usable = token && token !== "your-github-pat" ? token : undefined;
    return {
      Accept: "application/vnd.github+json",
      "User-Agent": "ai-portfolio-sync",
      ...(usable ? { Authorization: `Bearer ${usable}` } : {}),
    };
  }

  async sync() {
    const user = this.config.get<string>("github.username");
    if (!user) throw new Error("GITHUB_USERNAME not configured.");

    const job = await this.prisma.syncJob.create({
      data: { source: "GITHUB", status: "running" },
    });

    let indexed = 0;
    try {
      const res = await fetch(
        `https://api.github.com/users/${user}/repos?per_page=100&sort=updated`,
        { headers: this.headers() },
      );
      const payload = (await res.json()) as unknown;

      if (!res.ok) {
        const msg =
          (payload as { message?: string })?.message ?? `HTTP ${res.status}`;
        if (res.status === 401)
          throw new Error(`GitHub auth failed (401): ${msg}. Check GITHUB_TOKEN.`);
        if (res.status === 403)
          throw new Error(
            `GitHub rate limit / forbidden (403): ${msg}. Add a GITHUB_TOKEN to raise limits.`,
          );
        if (res.status === 404)
          throw new Error(
            `GitHub user "${user}" not found (404). Check GITHUB_USERNAME.`,
          );
        throw new Error(`GitHub API error [${res.status}]: ${msg}`);
      }
      if (!Array.isArray(payload)) {
        throw new Error(
          `Unexpected GitHub response (not a repo list): ${JSON.stringify(
            payload,
          ).slice(0, 200)}`,
        );
      }
      const repos = payload as GhRepo[];

      for (const repo of repos.filter((r) => !r.fork)) {
        const readme = await this.fetchReadme(user, repo.name);
        const body =
          `# ${repo.name}\n${repo.description ?? ""}\n` +
          `Language: ${repo.language ?? "n/a"} | Stars: ${repo.stargazers_count}\n` +
          `Topics: ${(repo.topics ?? []).join(", ")}\n\n${readme}`;

        const existing = await this.prisma.document.findFirst({
          where: { title: repo.name, source: "GITHUB" },
        });
        const doc = existing
          ? await this.prisma.document.update({
              where: { id: existing.id },
              data: { metadata: this.meta(repo), status: "PENDING" },
            })
          : await this.prisma.document.create({
              data: {
                title: repo.name,
                docType: "README",
                source: "GITHUB",
                tags: repo.topics ?? [],
                metadata: this.meta(repo),
              },
            });

        if (existing)
          await this.prisma.chunk.deleteMany({ where: { documentId: doc.id } });
        await this.ingestion.ingestText(doc.id, body);
        indexed += 1;
      }

      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: { status: "success", finishedAt: new Date(), stats: { indexed } },
      });
      return { indexed };
    } catch (err) {
      this.logger.error(String(err));
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          stats: { error: String(err) },
        },
      });
      throw err;
    }
  }

  private meta(r: GhRepo) {
    return {
      url: r.html_url,
      language: r.language,
      stars: r.stargazers_count,
      topics: r.topics,
    } as any;
  }

  private async fetchReadme(user: string, repo: string): Promise<string> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${user}/${repo}/readme`,
        {
          headers: { ...this.headers(), Accept: "application/vnd.github.raw" },
        },
      );
      return res.ok ? await res.text() : "";
    } catch {
      return "";
    }
  }
}
