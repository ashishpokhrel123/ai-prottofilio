import { PrismaClient } from '@prisma/client';
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const prisma = new PrismaClient();
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

const KNOWLEDGE_DIR = join(process.cwd(), 'knowledge');

async function main() {
  // ---- Admin user ----
  await prisma.user.upsert({
    where: { email: process.env.ADMIN_EMAIL ?? 'admin@ashishpokhrel.dev' },
    update: {},
    create: {
      email: process.env.ADMIN_EMAIL ?? 'admin@ashishpokhrel.dev',
      password: sha(process.env.ADMIN_PASSWORD ?? 'change-me'),
      name: 'Ashish Pokhrel',
      role: 'ADMIN',
    },
  });

  // ---- Skills ----
  const skills = [
    ['TypeScript', 'Languages', 5],
    ['Python', 'Languages', 4],
    ['NestJS', 'Backend', 5],
    ['Next.js', 'Frontend', 5],
    ['PostgreSQL', 'Database', 4],
    ['pgvector', 'AI', 4],
    ['LangGraph', 'AI', 4],
    ['Google Gemini', 'AI', 4],
    ['Redis', 'Backend', 4],
    ['BullMQ', 'Backend', 4],
    ['Docker', 'DevOps', 4],
    ['AWS', 'Cloud', 4],
    ['React', 'Frontend', 5],
    ['Tailwind CSS', 'Frontend', 5],
    ['Prisma', 'Database', 4],
  ] as const;
  for (const [name, category, level] of skills) {
    await prisma.skill.upsert({
      where: { name },
      update: { category, level },
      create: { name, category, level },
    });
  }

  // ---- Projects ----
  await prisma.project.upsert({
    where: { slug: 'immortalis' },
    update: {},
    create: {
      slug: 'immortalis',
      name: 'Immortalis',
      summary: 'A digital-legacy platform with scheduled message delivery and an AI assistant.',
      description:
        'Immortalis preserves memories, documents, and messages and delivers them over time. It pairs an encrypted vault with a durable scheduling engine and a RAG assistant.',
      architecture:
        'Next.js frontend; NestJS modular backend; PostgreSQL + pgvector; Redis/BullMQ for durable scheduling; AWS S3 + KMS for encrypted storage.',
      features: [
        'Encrypted memory vault with per-recipient access control',
        'Time- and event-based delivery via durable jobs',
        'AI assistant grounded in archived content',
        'Audit log and legacy-executor workflow',
      ],
      technologies: ['NestJS', 'PostgreSQL', 'pgvector', 'Redis', 'BullMQ', 'Next.js', 'TypeScript', 'AWS', 'Docker'],
      tags: ['AI', 'Backend', 'AWS', 'RAG'],
      githubUrl: 'https://github.com/ashishpokhrel/immortalis',
      challenges: 'Delivery guarantees for messages scheduled years ahead; searchable-yet-encrypted content.',
      lessonsLearned: 'Durable scheduling is a state-machine problem; idempotency beats clever triggers.',
      featured: true,
      order: 1,
    },
  });

  await prisma.project.upsert({
    where: { slug: 'ai-portfolio' },
    update: {},
    create: {
      slug: 'ai-portfolio',
      name: 'Agentic AI Portfolio',
      summary: 'This portfolio — an AI assistant that answers questions about me using agentic RAG.',
      description:
        'An enterprise-grade portfolio where the site itself is an AI agent. Uses pgvector retrieval, a tool-using agent, and Gemini for grounded, cited answers.',
      architecture: 'Next.js 15 + NestJS monorepo; pgvector RAG; LangGraph-style agent; streaming SSE/WebSocket.',
      features: ['Agentic tool use', 'Hybrid semantic + keyword search', 'Streaming cited answers', 'Admin ingestion panel'],
      technologies: ['Next.js', 'NestJS', 'pgvector', 'Gemini', 'Redis', 'Docker'],
      tags: ['AI', 'RAG', 'Backend', 'Frontend'],
      githubUrl: 'https://github.com/ashishpokhrel/ai-portfolio',
      featured: true,
      order: 2,
    },
  });

  // ---- Experience ----
  const existingXp = await prisma.experience.findFirst({ where: { company: 'Freelance / Personal Projects' } });
  if (!existingXp) {
    await prisma.experience.create({
      data: {
        company: 'Freelance / Personal Projects',
        role: 'AI Engineer & Full-Stack Developer',
        startDate: new Date('2023-01-01'),
        current: true,
        description: 'Design and build agentic AI applications and full-stack products.',
        highlights: [
          'Built agentic RAG systems over PostgreSQL + pgvector',
          'Shipped streaming LLM chat experiences with Next.js',
          'Designed durable job pipelines with Redis + BullMQ',
        ],
        technologies: ['NestJS', 'Next.js', 'pgvector', 'Gemini', 'AWS'],
      },
    });
  }

  // ---- Education ----
  const existingEdu = await prisma.education.findFirst();
  if (!existingEdu) {
    await prisma.education.create({
      data: {
        institution: 'Your University',
        degree: 'B.Sc. Computer Science',
        field: 'Computer Science',
        startDate: new Date('2019-01-01'),
        endDate: new Date('2023-01-01'),
      },
    });
  }

  // ---- Register knowledge documents (PENDING → indexed by worker) ----
  await registerKnowledgeDir(join(KNOWLEDGE_DIR, 'resume'), 'RESUME');
  await registerKnowledgeDir(join(KNOWLEDGE_DIR, 'projects'), 'PROJECT');
  await registerKnowledgeDir(join(KNOWLEDGE_DIR, 'experience'), 'EXPERIENCE');
  await registerKnowledgeDir(join(KNOWLEDGE_DIR, 'skills'), 'SKILL');
  await registerKnowledgeDir(join(KNOWLEDGE_DIR, 'blogs'), 'BLOG');
  await registerKnowledgeDir(join(KNOWLEDGE_DIR, 'certificates'), 'CERTIFICATE');
  await registerKnowledgeDir(join(KNOWLEDGE_DIR, 'education'), 'EDUCATION');

  // eslint-disable-next-line no-console
  console.log('Seed complete. Start the worker and run POST /api/v1/embeddings/index to embed knowledge docs.');
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir).filter((f) => /\.(md|txt|json|csv)$/i.test(f));
  } catch {
    return [];
  }
}

async function registerKnowledgeDir(dir: string, docType: string) {
  for (const file of safeReadDir(dir)) {
    const filePath = join(dir, file);
    const title = file.replace(/\.[^.]+$/, '');
    const existing = await prisma.document.findFirst({ where: { title, source: 'MANUAL_UPLOAD' } });
    if (existing) continue;
    await prisma.document.create({
      data: {
        title,
        docType: docType as any,
        source: 'MANUAL_UPLOAD',
        filePath,
        mimeType: 'text/markdown',
        status: 'PENDING',
        tags: [docType.toLowerCase()],
        author: 'Ashish Pokhrel',
      },
    });
  }
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
