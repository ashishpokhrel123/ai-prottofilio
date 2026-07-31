import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AppConfigService } from "../../common/config/app-config.service";
import {
  InvalidInputError,
  ResourceNotFoundError,
} from "../../core/errors/domain.errors";
import { LocalFileStorage } from "./local-file.storage";

describe("LocalFileStorage", () => {
  let root: string;
  let storage: LocalFileStorage;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "storage-test-"));
    storage = new LocalFileStorage({
      uploads: { dir: root, maxBytes: 1024 * 1024 },
    } as AppConfigService);
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  describe("save", () => {
    it("stores the bytes and returns a key", async () => {
      const stored = await storage.save(Buffer.from("hello"), {
        originalName: "notes.md",
      });

      expect(stored.size).toBe(5);
      expect(await storage.read(stored.key)).toEqual(Buffer.from("hello"));
    });

    /**
     * The key is generated, never derived from the client-supplied filename.
     * That is what makes traversal via the upload path structurally impossible.
     */
    it("generates a key that does not reuse the caller's filename", async () => {
      const stored = await storage.save(Buffer.from("x"), {
        originalName: "../../etc/passwd.md",
      });

      expect(stored.key).not.toContain("..");
      expect(stored.key).not.toContain("/");
      expect(stored.key.endsWith(".md")).toBe(true);
    });

    it("gives concurrent uploads of the same name distinct keys", async () => {
      const [a, b] = await Promise.all([
        storage.save(Buffer.from("a"), { originalName: "resume.pdf" }),
        storage.save(Buffer.from("b"), { originalName: "resume.pdf" }),
      ]);

      expect(a.key).not.toBe(b.key);
      expect(await storage.read(a.key)).toEqual(Buffer.from("a"));
      expect(await storage.read(b.key)).toEqual(Buffer.from("b"));
    });

    it.each([
      ["an executable", "payload.sh"],
      ["a binary", "malware.exe"],
      ["no extension", "README"],
      ["a disguised script", "notes.md.js"],
    ])("rejects %s", async (_label, filename) => {
      await expect(
        storage.save(Buffer.from("x"), { originalName: filename }),
      ).rejects.toThrow(InvalidInputError);
    });

    it.each(["notes.md", "doc.pdf", "data.json", "sheet.csv", "scan.png"])(
      "accepts %s",
      async (filename) => {
        await expect(
          storage.save(Buffer.from("x"), { originalName: filename }),
        ).resolves.toBeDefined();
      },
    );
  });

  describe("path traversal defence", () => {
    it.each([
      "../outside.md",
      "../../etc/passwd",
      "subdir/../../escape.md",
      "/etc/passwd",
    ])("refuses to read through %j", async (key) => {
      await expect(storage.read(key)).rejects.toThrow();
    });

    it("refuses a key containing a null byte", async () => {
      await expect(storage.read("notes.md\0.png")).rejects.toThrow(
        InvalidInputError,
      );
    });

    it("refuses an empty key", async () => {
      await expect(storage.read("")).rejects.toThrow(InvalidInputError);
    });

    it("cannot read a file that exists outside the storage root", async () => {
      const outside = join(root, "..", `outside-${Date.now()}.md`);
      await writeFile(outside, "secret");

      try {
        await expect(
          storage.read(`../${outside.split("/").pop() ?? ""}`),
        ).rejects.toThrow(InvalidInputError);
        // Prove the file really was readable — the guard is what stopped it.
        expect(await readFile(outside, "utf8")).toBe("secret");
      } finally {
        await rm(outside, { force: true });
      }
    });
  });

  describe("read", () => {
    it("reports a missing key as not found", async () => {
      await expect(storage.read("absent.md")).rejects.toThrow(
        ResourceNotFoundError,
      );
    });
  });

  describe("delete", () => {
    it("removes a stored file", async () => {
      const { key } = await storage.save(Buffer.from("x"), {
        originalName: "temp.md",
      });

      await storage.delete(key);
      expect(await storage.exists(key)).toBe(false);
    });

    it("treats deleting an absent file as success", async () => {
      // Orphaned bytes are wasted disk, not a failure worth propagating.
      await expect(storage.delete("never-existed.md")).resolves.toBeUndefined();
    });
  });

  describe("exists", () => {
    it("distinguishes stored from absent files", async () => {
      const { key } = await storage.save(Buffer.from("x"), {
        originalName: "here.md",
      });

      expect(await storage.exists(key)).toBe(true);
      expect(await storage.exists("not-here.md")).toBe(false);
    });
  });
});
