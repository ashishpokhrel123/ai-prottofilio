import { createHash } from "node:crypto";
import { PasswordHasher } from "./password.hasher";

describe("PasswordHasher", () => {
  const hasher = new PasswordHasher();

  // Argon2 is deliberately slow; the default 5s Jest timeout is too tight.
  jest.setTimeout(20_000);

  it("produces an argon2id hash", async () => {
    const hash = await hasher.hash("correct horse battery staple");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("salts each hash, so identical passwords differ", async () => {
    const [a, b] = await Promise.all([
      hasher.hash("same-password"),
      hasher.hash("same-password"),
    ]);

    expect(a).not.toBe(b);
  });

  it("verifies the correct password", async () => {
    const hash = await hasher.hash("s3cure-p4ssword");
    await expect(hasher.verify(hash, "s3cure-p4ssword")).resolves.toEqual({
      valid: true,
      needsRehash: false,
    });
  });

  it("rejects the wrong password", async () => {
    const hash = await hasher.hash("s3cure-p4ssword");
    const result = await hasher.verify(hash, "wrong-password");

    expect(result.valid).toBe(false);
  });

  it("treats a malformed hash as a failed verification, not an error", async () => {
    await expect(hasher.verify("not-a-hash", "anything")).resolves.toEqual({
      valid: false,
      needsRehash: false,
    });
  });

  describe("legacy SHA-256 migration", () => {
    const legacy = (password: string) =>
      createHash("sha256").update(password).digest("hex");

    it("accepts a matching legacy digest and flags it for rehash", async () => {
      const result = await hasher.verify(
        legacy("old-password"),
        "old-password",
      );

      expect(result).toEqual({ valid: true, needsRehash: true });
    });

    it("rejects a non-matching legacy digest", async () => {
      const result = await hasher.verify(legacy("old-password"), "guess");

      expect(result.valid).toBe(false);
    });
  });
});
