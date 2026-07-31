import { createHash, timingSafeEqual } from "node:crypto";
import { Injectable, Logger } from "@nestjs/common";
import * as argon2 from "argon2";

/**
 * Password hashing.
 *
 * The previous implementation used a bare, unsalted SHA-256. That is not a
 * password hash: it is fast by design, so an attacker with the database can
 * test billions of candidates per second, and identical passwords produce
 * identical digests across accounts.
 *
 * Argon2id is the OWASP-recommended default — memory-hard, GPU-resistant, and
 * salted per hash. Parameters follow the OWASP minimum (19 MiB, t=2, p=1).
 */
@Injectable()
export class PasswordHasher {
  private readonly logger = new Logger(PasswordHasher.name);

  private static readonly OPTIONS: argon2.Options = {
    type: argon2.argon2id,
    memoryCost: 19_456, // 19 MiB
    timeCost: 2,
    parallelism: 1,
  };

  hash(plaintext: string): Promise<string> {
    return argon2.hash(plaintext, PasswordHasher.OPTIONS);
  }

  /**
   * Verifies a password, transparently accepting legacy SHA-256 digests so an
   * existing deployment keeps working after this upgrade. `needsRehash` tells
   * the caller to re-store the password with argon2 on the next successful
   * login, which migrates every account without a password reset.
   */
  async verify(
    storedHash: string,
    plaintext: string,
  ): Promise<{ valid: boolean; needsRehash: boolean }> {
    if (isLegacySha256(storedHash)) {
      this.logger.warn(
        "Verified a legacy SHA-256 password hash — it will be upgraded to argon2id now.",
      );
      return {
        valid: legacySha256Matches(storedHash, plaintext),
        needsRehash: true,
      };
    }

    try {
      const valid = await argon2.verify(storedHash, plaintext);
      return { valid, needsRehash: false };
    } catch {
      // A malformed hash must read as "wrong password", never as an error the
      // caller might mistake for success.
      return { valid: false, needsRehash: false };
    }
  }
}

/** Legacy digests are exactly 64 lowercase hex characters. */
function isLegacySha256(hash: string): boolean {
  return /^[a-f0-9]{64}$/i.test(hash);
}

function legacySha256Matches(storedHash: string, plaintext: string): boolean {
  const candidate = createHash("sha256").update(plaintext).digest();
  const stored = Buffer.from(storedHash, "hex");

  if (stored.length !== candidate.length) return false;
  // Constant-time even on the legacy path — a length-independent early return
  // would leak digest prefixes through timing.
  return timingSafeEqual(stored, candidate);
}
