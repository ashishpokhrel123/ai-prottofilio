import { loadEnvFiles } from "../src/common/config/load-env";

// Must run before PrismaClient is constructed — it reads DATABASE_URL at
// construction — and before ADMIN_PASSWORD is checked. Unlike `main.ts`, this
// script is invoked directly by ts-node rather than through the Prisma CLI, so
// nothing else loads the root `.env` for it.
loadEnvFiles();

import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readdir } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import { PrismaClient, type DocumentType } from "@prisma/client";
import * as argon2 from "argon2";

/**
 * Idempotent seed: safe to re-run against an existing database.
 *
 * Creates the admin user, baseline skills/projects/experience, and registers
 * everything under `knowledge/` as PENDING documents for the ingestion
 * pipeline to embed.
 */

const prisma = new PrismaClient();

const KNOWLEDGE_DIR = join(process.cwd(), "knowledge");
const UPLOAD_DIR = resolveUploadDir();

const INGESTIBLE = /\.(md|txt|json|csv|pdf|docx)$/i;

async function main(): Promise<void> {
  await seedAdminUser();
  await seedSkills();
  await seedProjects();
  await seedExperience();
  await seedEducation();
  await registerKnowledge();

  console.log(
    "Seed complete. Run POST /api/v1/embeddings/index (authenticated) to embed the knowledge documents.",
  );
}

/**
 * The admin password is hashed with argon2id, matching `PasswordHasher`.
 * A weak or default password is refused outright rather than silently seeded.
 */
async function seedAdminUser(): Promise<void> {
  const email = (process.env.ADMIN_EMAIL ?? "admin@ashishpokhrel.dev")
    .toLowerCase()
    .trim();
  const password = process.env.ADMIN_PASSWORD;

  if (!password || password === "change-me" || password.length < 12) {
    throw new Error(
      "ADMIN_PASSWORD must be set to a real value of at least 12 characters before seeding.",
    );
  }

  const hashed = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });

  await prisma.user.upsert({
    where: { email },
    // Re-running the seed rotates the password to whatever ADMIN_PASSWORD now
    // holds, which is how you recover from a lost admin credential.
    update: { password: hashed },
    create: { email, password: hashed, name: "Ashish Pokhrel", role: "ADMIN" },
  });

  console.log(`Admin user ready: ${email}`);
}

async function seedSkills(): Promise<void> {
  const skills = [
    ["TypeScript", "Languages", 5],
    ["Python", "Languages", 4],
    ["NestJS", "Backend", 5],
    ["Next.js", "Frontend", 5],
    ["PostgreSQL", "Databases", 4],
    ["pgvector", "AI/ML", 4],
    ["Google Gemini", "AI/ML", 4],
    ["Redis", "Backend", 4],
    ["BullMQ", "Backend", 4],
    ["Docker", "DevOps", 4],
    ["AWS", "Cloud", 4],
    ["React", "Frontend", 5],
    ["Tailwind CSS", "Frontend", 5],
    ["Prisma", "Databases", 4],
  ] as const;

  for (const [name, category, level] of skills) {
    await prisma.skill.upsert({
      where: { name },
      update: { category, level },
      create: { name, category, level },
    });
  }
}

async function seedProjects(): Promise<void> {
  await prisma.project.upsert({
    where: { slug: "immortalis" },
    update: {},
    create: {
      slug: "immortalis",
      name: "Immortalis",
      summary:
        "A digital-legacy platform with scheduled message delivery and an AI assistant.",
      description:
        "Immortalis preserves memories, documents, and messages and delivers them over time. It pairs an encrypted vault with a durable scheduling engine and a RAG assistant.",
      architecture:
        "Next.js frontend; NestJS modular backend; PostgreSQL + pgvector; Redis/BullMQ for durable scheduling; AWS S3 + KMS for encrypted storage.",
      features: [
        "Encrypted memory vault with per-recipient access control",
        "Time- and event-based delivery via durable jobs",
        "AI assistant grounded in archived content",
        "Audit log and legacy-executor workflow",
      ],
      technologies: [
        "NestJS",
        "PostgreSQL",
        "pgvector",
        "Redis",
        "BullMQ",
        "Next.js",
        "TypeScript",
        "AWS",
        "Docker",
      ],
      tags: ["AI", "Backend", "AWS", "RAG"],
      githubUrl: "https://github.com/ashishpokhrel/immortalis",
      challenges:
        "Delivery guarantees for messages scheduled years ahead; searchable-yet-encrypted content.",
      lessonsLearned:
        "Durable scheduling is a state-machine problem; idempotency beats clever triggers.",
      featured: true,
      order: 1,
    },
  });

  await prisma.project.upsert({
    where: { slug: "ai-portfolio" },
    update: {},
    create: {
      slug: "ai-portfolio",
      name: "Agentic AI Portfolio",
      summary:
        "This portfolio — an AI assistant that answers questions about me using agentic RAG.",
      description:
        "A portfolio where the site itself is an AI agent. Uses pgvector retrieval, a tool-using agent, and Gemini for grounded, cited answers.",
      architecture:
        "Next.js 15 + NestJS monorepo; hexagonal ports/adapters; pgvector hybrid retrieval; streaming SSE and WebSocket transports.",
      features: [
        "Agentic tool use across 12 capabilities",
        "Hybrid semantic + keyword search with RRF",
        "Streaming, cited answers",
        "Admin ingestion panel",
      ],
      technologies: [
        "Next.js",
        "NestJS",
        "pgvector",
        "Gemini",
        "Redis",
        "Docker",
      ],
      tags: ["AI", "RAG", "Backend", "Frontend"],
      githubUrl: "https://github.com/ashishpokhrel/ai-portfolio",
      featured: true,
      order: 2,
    },
  });
}

async function seedExperience(): Promise<void> {
  const company = "Freelance / Personal Projects";
  const existing = await prisma.experience.findFirst({ where: { company } });
  if (existing) return;

  await prisma.experience.create({
    data: {
      company,
      role: "AI Engineer & Full-Stack Developer",
      startDate: new Date("2023-01-01"),
      current: true,
      description:
        "Design and build agentic AI applications and full-stack products.",
      highlights: [
        "Built agentic RAG systems over PostgreSQL + pgvector",
        "Shipped streaming LLM chat experiences with Next.js",
        "Designed durable job pipelines with Redis + BullMQ",
      ],
      technologies: ["NestJS", "Next.js", "pgvector", "Gemini", "AWS"],
    },
  });
}

async function seedEducation(): Promise<void> {
  if (await prisma.education.findFirst()) return;

  await prisma.education.create({
    data: {
      institution: "Your University",
      degree: "B.Sc. Computer Science",
      field: "Computer Science",
      startDate: new Date("2019-01-01"),
      endDate: new Date("2023-01-01"),
    },
  });
}

const KNOWLEDGE_MAP: readonly [string, DocumentType][] = [
  ["resume", "RESUME"],
  ["projects", "PROJECT"],
  ["experience", "EXPERIENCE"],
  ["skills", "SKILL"],
  ["blogs", "BLOG"],
  ["certificates", "CERTIFICATE"],
  ["education", "EDUCATION"],
];

async function registerKnowledge(): Promise<void> {
  for (const [folder, docType] of KNOWLEDGE_MAP) {
    await registerDirectory(join(KNOWLEDGE_DIR, folder), docType);
  }
}

/**
 * Registers a knowledge directory's files as documents.
 *
 * Files are copied into the upload directory and stored by generated key,
 * because `filePath` is a `FileStoragePort` key — not a filesystem path. That
 * indirection is what lets the storage backend change without a data migration.
 */
async function registerDirectory(
  dir: string,
  docType: DocumentType,
): Promise<void> {
  const files = await readdir(dir).catch(() => [] as string[]);

  for (const file of files.filter((f) => INGESTIBLE.test(f))) {
    const title = file.replace(/\.[^.]+$/, "");

    const existing = await prisma.document.findFirst({
      where: { title, source: "MANUAL_UPLOAD" },
      select: { id: true },
    });
    if (existing) continue;

    const key = `seed-${Date.now()}-${randomUUID()}${extname(file)}`;
    await mkdir(UPLOAD_DIR, { recursive: true });
    await copyFile(join(dir, file), join(UPLOAD_DIR, key));

    await prisma.document.create({
      data: {
        title,
        docType,
        source: "MANUAL_UPLOAD",
        filePath: key,
        mimeType: mimeTypeFor(file),
        status: "PENDING",
        tags: [docType.toLowerCase()],
        author: "Ashish Pokhrel",
      },
    });
  }
}

function mimeTypeFor(file: string): string {
  switch (extname(file).toLowerCase()) {
    case ".md":
      return "text/markdown";
    case ".txt":
      return "text/plain";
    case ".json":
      return "application/json";
    case ".csv":
      return "text/csv";
    case ".pdf":
      return "application/pdf";
    case ".docx":
      return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
    default:
      return "application/octet-stream";
  }
}

function resolveUploadDir(): string {
  const dir = process.env.UPLOAD_DIR ?? "uploads";
  return isAbsolute(dir) ? dir : resolve(process.cwd(), dir);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
