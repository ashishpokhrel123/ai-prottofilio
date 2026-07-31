import type { AppConfigService } from "../../common/config/app-config.service";
import { ResourceNotFoundError } from "../../core/errors/domain.errors";
import type { FileStoragePort } from "../../core/ports";
import type { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { FakeEmbeddings, FakeVectorStore } from "../agent/test-doubles";
import { IngestionService } from "./ingestion.service";

const CONFIG = {
  rag: { chunkSize: 800, chunkOverlap: 120 },
} as AppConfigService;

function makeService(options: { chunks?: number; document?: unknown } = {}) {
  const statuses: string[] = [];
  const chunkCount = options.chunks ?? 3;

  const prisma = {
    document: {
      update: jest.fn(({ data }: { data: { status: string } }) => {
        statuses.push(data.status);
        return Promise.resolve({});
      }),
      findUnique: jest.fn().mockResolvedValue(options.document ?? null),
    },
    chunk: {
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      // Returns a fixed number of rows so the assertions target the
      // service's batching, not the chunker's splitting decisions.
      createManyAndReturn: jest.fn(() =>
        Promise.resolve(
          Array.from({ length: chunkCount }, (_, i) => ({
            id: `chunk-${i}`,
            content: `content ${i}`,
          })),
        ),
      ),
    },
  } as unknown as PrismaService;

  const storage = {
    read: jest.fn().mockResolvedValue(Buffer.from("# Title\n\nSome content.")),
    save: jest.fn(),
    delete: jest.fn(),
    exists: jest.fn(),
  } as unknown as FileStoragePort;

  const vectors = new FakeVectorStore();

  return {
    service: new IngestionService(
      CONFIG,
      prisma,
      new FakeEmbeddings(),
      vectors,
      storage,
    ),
    prisma,
    storage,
    vectors,
    statuses,
  };
}

describe("IngestionService", () => {
  describe("ingestText", () => {
    it("moves the document through PROCESSING to INDEXED", async () => {
      const { service, statuses } = makeService();

      const count = await service.ingestText("doc-1", "Some text to ingest.");

      expect(count).toBeGreaterThan(0);
      expect(statuses).toEqual(["PROCESSING", "INDEXED"]);
    });

    it("marks the document FAILED when there is nothing to chunk", async () => {
      const { service, statuses } = makeService();

      expect(await service.ingestText("doc-1", "   ")).toBe(0);
      expect(statuses).toEqual(["PROCESSING", "FAILED"]);
    });

    it("deletes existing chunks first, so a re-index cannot duplicate", async () => {
      const { service, prisma } = makeService();

      await service.ingestText("doc-1", "Some text to ingest.");

      expect(prisma.chunk.deleteMany).toHaveBeenCalledWith({
        where: { documentId: "doc-1" },
      });
    });

    it("persists one embedding per chunk", async () => {
      const { service, vectors } = makeService({ chunks: 3 });

      await service.ingestText("doc-1", "Some text to ingest.");

      expect(vectors.saved).toHaveLength(3);
      expect(vectors.saved.map((s) => s.chunkId)).toEqual([
        "chunk-0",
        "chunk-1",
        "chunk-2",
      ]);
    });

    it("batches embedding writes rather than one call per chunk", async () => {
      // 70 chunks at a batch size of 32 is three batches, not seventy writes.
      const { service, vectors } = makeService({ chunks: 70 });
      const saveEmbeddings = jest.spyOn(vectors, "saveEmbeddings");

      await service.ingestText("doc-1", "Some text to ingest.");

      expect(saveEmbeddings).toHaveBeenCalledTimes(3);
      expect(vectors.saved).toHaveLength(70);
    });

    it("marks FAILED and rethrows when embedding fails", async () => {
      const { service, statuses } = makeService();
      jest
        .spyOn(FakeEmbeddings.prototype, "embedDocuments")
        .mockRejectedValueOnce(new Error("provider is down"));

      await expect(
        service.ingestText("doc-1", "Some text to ingest."),
      ).rejects.toThrow("provider is down");

      // A stuck PROCESSING row would be invisible in the admin console.
      expect(statuses).toEqual(["PROCESSING", "FAILED"]);
    });
  });

  describe("ingestFile", () => {
    it("reads from storage by key and extracts before chunking", async () => {
      const { service, storage } = makeService();

      const count = await service.ingestFile("doc-1", "stored-key.md");

      expect(storage.read).toHaveBeenCalledWith("stored-key.md");
      expect(count).toBeGreaterThan(0);
    });
  });

  describe("reindex", () => {
    it("rejects an unknown document", async () => {
      const { service } = makeService({ document: null });

      await expect(service.reindex("missing")).rejects.toThrow(
        ResourceNotFoundError,
      );
    });

    it("rejects a document with no stored source file", async () => {
      const { service } = makeService({
        document: { filePath: null, mimeType: null },
      });

      await expect(service.reindex("doc-1")).rejects.toThrow(
        ResourceNotFoundError,
      );
    });

    it("re-ingests from the stored file", async () => {
      const { service, storage } = makeService({
        document: { filePath: "key.md", mimeType: "text/markdown" },
      });

      expect(await service.reindex("doc-1")).toBeGreaterThan(0);
      expect(storage.read).toHaveBeenCalledWith("key.md");
    });
  });
});
