import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { AppConfigService } from "../../common/config/app-config.service";
import {
  DependencyUnavailableError,
  InvalidInputError,
  errorMessage,
} from "../../core/errors/domain.errors";
import { IngestionService } from "../../lib/embeddings/ingestion.service";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";

interface GitHubRepository {
  readonly name: string;
  readonly description: string | null;
  readonly html_url: string;
  readonly language: string | null;
  readonly stargazers_count: number;
  readonly topics?: string[];
  readonly fork: boolean;
  readonly archived: boolean;
}

export interface SyncResult {
  readonly indexed: number;
  /** Forks and archived repositories, deliberately not indexed. */
  readonly skipped: number;
  /** Repositories that errored during ingestion, by name. */
  readonly failed: readonly string[];
}

const PLACEHOLDER_TOKEN = "your-github-pat";
const REPOS_PER_PAGE = 100;

/**
 * Pulls public repositories and READMEs from GitHub and ingests them, so the
 * agent can answer questions about live code without manual uploads.
 */
@Injectable()
export class GithubService {
  private readonly logger = new Logger(GithubService.name);

  constructor(
    private readonly config: AppConfigService,
    private readonly prisma: PrismaService,
    private readonly ingestion: IngestionService,
  ) {}

  async sync(): Promise<SyncResult> {
    const username = this.config.github.username;
    if (!username) {
      throw new InvalidInputError("GITHUB_USERNAME is not configured.");
    }

    const job = await this.prisma.syncJob.create({
      data: { source: "GITHUB", status: "running" },
      select: { id: true },
    });

    try {
      const repositories = await this.fetchRepositories(username);
      // Forks and archives are noise: they aren't this person's active work,
      // and indexing them dilutes every retrieval.
      const relevant = repositories.filter((r) => !r.fork && !r.archived);
      const skipped = repositories.length - relevant.length;

      let indexed = 0;
      const failed: string[] = [];

      for (const repo of relevant) {
        // Isolated per repository. Embedding a large README can fail — a
        // provider rate limit is the common case — and previously that threw
        // out of the loop, abandoning every remaining repo and reporting the
        // whole sync as failed even though earlier repos had indexed fine.
        try {
          await this.ingestRepository(username, repo);
          indexed += 1;
        } catch (err) {
          failed.push(repo.name);
          this.logger.warn(
            `Failed to index repository "${repo.name}": ${errorMessage(err)}`,
          );
        }
      }

      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          // Partial success is still success: the alternative is discarding
          // the repositories that did index.
          status: failed.length === 0 ? "success" : "partial",
          finishedAt: new Date(),
          stats: { indexed, skipped, failed },
        },
      });

      this.logger.log(
        `Synced ${indexed} repositories for ${username}` +
          (failed.length > 0 ? ` (${failed.length} failed)` : ""),
      );

      return { indexed, skipped, failed };
    } catch (err) {
      await this.prisma.syncJob.update({
        where: { id: job.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          stats: { error: errorMessage(err) },
        },
      });
      throw err;
    }
  }

  private async ingestRepository(
    username: string,
    repo: GitHubRepository,
  ): Promise<void> {
    const readme = await this.fetchReadme(username, repo.name);

    const body = [
      `# ${repo.name}`,
      repo.description ?? "",
      `Language: ${repo.language ?? "n/a"} | Stars: ${repo.stargazers_count}`,
      `Topics: ${(repo.topics ?? []).join(", ")}`,
      "",
      readme,
    ].join("\n");

    const metadata = {
      url: repo.html_url,
      language: repo.language,
      stars: repo.stargazers_count,
      topics: repo.topics ?? [],
    } satisfies Prisma.InputJsonObject;

    const existing = await this.prisma.document.findFirst({
      where: { title: repo.name, source: "GITHUB" },
      select: { id: true },
    });

    const document = existing
      ? await this.prisma.document.update({
          where: { id: existing.id },
          data: { metadata, tags: repo.topics ?? [], status: "PENDING" },
          select: { id: true },
        })
      : await this.prisma.document.create({
          data: {
            title: repo.name,
            docType: "README",
            source: "GITHUB",
            tags: repo.topics ?? [],
            metadata,
          },
          select: { id: true },
        });

    // ingestText replaces existing chunks, so a re-sync can't duplicate them.
    await this.ingestion.ingestText(document.id, body);
  }

  private async fetchRepositories(
    username: string,
  ): Promise<GitHubRepository[]> {
    const url =
      `https://api.github.com/users/${encodeURIComponent(username)}/repos` +
      `?per_page=${REPOS_PER_PAGE}&sort=updated`;

    const payload = await this.request<unknown>(url);

    if (!Array.isArray(payload)) {
      throw new DependencyUnavailableError(
        "github",
        "GitHub returned an unexpected response instead of a repository list.",
      );
    }
    return payload as GitHubRepository[];
  }

  /** A missing README is normal and must not fail the whole sync. */
  private async fetchReadme(username: string, repo: string): Promise<string> {
    try {
      const res = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(username)}/${encodeURIComponent(repo)}/readme`,
        {
          headers: { ...this.headers(), Accept: "application/vnd.github.raw" },
        },
      );
      return res.ok ? await res.text() : "";
    } catch (err) {
      this.logger.debug(`No README for ${repo}: ${errorMessage(err)}`);
      return "";
    }
  }

  private async request<T>(url: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(url, { headers: this.headers() });
    } catch (err) {
      throw new DependencyUnavailableError(
        "github",
        `Could not reach the GitHub API: ${errorMessage(err)}`,
        { cause: err },
      );
    }

    if (!res.ok) throw this.describeFailure(res.status, await res.text());
    return (await res.json()) as T;
  }

  /**
   * Specific guidance beats a bare status code — each of these has a different
   * fix, and the admin UI surfaces this message verbatim.
   */
  private describeFailure(status: number, body: string): Error {
    const detail = body.slice(0, 200);

    const message =
      status === 401
        ? `GitHub authentication failed. Check GITHUB_TOKEN. (${detail})`
        : status === 403
          ? `GitHub rate limit or forbidden. Add a GITHUB_TOKEN to raise limits. (${detail})`
          : status === 404
            ? `GitHub user not found. Check GITHUB_USERNAME. (${detail})`
            : `GitHub API error [${status}]: ${detail}`;

    return new DependencyUnavailableError("github", message);
  }

  private headers(): Record<string, string> {
    const token = this.config.github.token;
    // Ignore the shipped placeholder so we fall back to unauthenticated access
    // (public repos still work) rather than a guaranteed 401.
    const usable = token && token !== PLACEHOLDER_TOKEN ? token : undefined;

    return {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "ai-portfolio-sync",
      ...(usable ? { Authorization: `Bearer ${usable}` } : {}),
    };
  }
}
