import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { Prisma } from "@prisma/client";
import { AppModule } from "../../src/app.module";
import { configureApp } from "../../src/bootstrap";
import { AppConfigService } from "../../src/common/config/app-config.service";
import {
  EMBEDDING_PORT,
  FILE_STORAGE_PORT,
  JOB_QUEUE_PORT,
  LLM_PORT,
  VECTOR_STORE_PORT,
} from "../../src/core/ports";
import type { FileStoragePort, JobQueuePort } from "../../src/core/ports";
import { PrismaService } from "../../src/infrastructure/persistence/prisma.service";
import {
  FakeEmbeddings,
  FakeLlm,
  FakeVectorStore,
} from "../../src/lib/agent/test-doubles";

/**
 * Boots the real application graph with every external dependency replaced by
 * an in-memory double.
 *
 * The point is to exercise the actual HTTP pipeline — routing, versioning,
 * guards, the validation pipe, the exception filter, throttling — without
 * needing Postgres, Redis or a Gemini key. Only the edges are faked.
 */

/** One Prisma model delegate's worth of jest mocks. */
export type ModelMock = Record<string, jest.Mock>;

/** Minimal Prisma stand-in. Each model method is set per test as needed. */
export type PrismaMock = Record<string, ModelMock | jest.Mock | unknown>;

export function createPrismaMock(overrides: PrismaMock = {}): PrismaMock {
  const model = () => ({
    findMany: jest.fn().mockResolvedValue([]),
    findUnique: jest.fn().mockResolvedValue(null),
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: "generated-id" }),
    update: jest.fn().mockResolvedValue({ id: "generated-id" }),
    delete: jest.fn().mockResolvedValue({ id: "generated-id" }),
    deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    count: jest.fn().mockResolvedValue(0),
    upsert: jest.fn().mockResolvedValue({ id: "generated-id" }),
    createManyAndReturn: jest.fn().mockResolvedValue([]),
  });

  return {
    user: model(),
    project: model(),
    skill: model(),
    experience: model(),
    education: model(),
    document: model(),
    chunk: model(),
    conversation: model(),
    message: model(),
    analyticsEvent: model(),
    syncJob: model(),
    ping: jest.fn().mockResolvedValue(true),
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn((arg: unknown) =>
      typeof arg === "function"
        ? (arg as (tx: unknown) => unknown)(createPrismaMock())
        : Promise.resolve([]),
    ),
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** A queue that records what was enqueued instead of talking to Redis. */
export class FakeQueue implements JobQueuePort {
  readonly enqueued: unknown[] = [];

  async enqueueIngestion(job: unknown): Promise<void> {
    this.enqueued.push(job);
  }
  async health() {
    return { mode: "inline" as const, healthy: true };
  }
  async close(): Promise<void> {}
}

/** In-memory file storage, so uploads never touch the filesystem. */
export class FakeStorage implements FileStoragePort {
  readonly files = new Map<string, Buffer>();

  async save(buffer: Buffer, meta: { originalName: string }) {
    const key = `test-${meta.originalName}`;
    this.files.set(key, buffer);
    return { key, size: buffer.byteLength };
  }
  async read(key: string): Promise<Buffer> {
    return this.files.get(key) ?? Buffer.from("");
  }
  async delete(key: string): Promise<void> {
    this.files.delete(key);
  }
  async exists(key: string): Promise<boolean> {
    return this.files.has(key);
  }
}

export interface TestContext {
  app: INestApplication;
  prisma: PrismaMock;
  queue: FakeQueue;
  storage: FakeStorage;
  llm: FakeLlm;
  close: () => Promise<void>;
}

export async function createTestApp(
  options: {
    prisma?: PrismaMock;
    llm?: FakeLlm;
  } = {},
): Promise<TestContext> {
  const prisma = options.prisma ?? createPrismaMock();
  const queue = new FakeQueue();
  const storage = new FakeStorage();
  const llm = options.llm ?? new FakeLlm({ stream: ["Hello", " there."] });

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(PrismaService)
    .useValue(prisma)
    .overrideProvider(LLM_PORT)
    .useValue(llm)
    .overrideProvider(EMBEDDING_PORT)
    .useValue(new FakeEmbeddings())
    .overrideProvider(VECTOR_STORE_PORT)
    .useValue(new FakeVectorStore())
    .overrideProvider(JOB_QUEUE_PORT)
    .useValue(queue)
    .overrideProvider(FILE_STORAGE_PORT)
    .useValue(storage)
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app, app.get(AppConfigService));
  await app.init();

  return { app, prisma, queue, storage, llm, close: () => app.close() };
}

/** Builds a Prisma initialization error, as thrown when Postgres is down. */
export function databaseDownError(): Error {
  return new Prisma.PrismaClientInitializationError(
    "Can't reach database server",
    "5.22.0",
  );
}
