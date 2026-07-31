import { Injectable, Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { AuthenticationError } from "../../core/errors/domain.errors";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { PasswordHasher } from "./password.hasher";
import type { JwtPayload } from "./jwt.strategy";

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly role: string;
}

export interface LoginResult {
  readonly accessToken: string;
  readonly expiresIn: string;
  readonly user: AuthenticatedUser;
}

/**
 * A dummy argon2 hash, verified against when the account does not exist.
 *
 * Without this, a missing user returns in microseconds while a wrong password
 * takes ~50ms, and that gap is a reliable account-enumeration oracle.
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZXg$Wt3vXQIL0nnBBmYYA1kUiKJqPYIvJ4kV0tFxRZbCkAA";

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly hasher: PasswordHasher,
  ) {}

  async login(email: string, password: string): Promise<LoginResult> {
    const user = await this.validate(email, password);

    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };

    return {
      accessToken: await this.jwt.signAsync(payload),
      expiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
      user,
    };
  }

  private async validate(
    email: string,
    password: string,
  ): Promise<AuthenticatedUser> {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (!user) {
      // Burn equivalent time, then fail with the same generic message a wrong
      // password produces.
      await this.hasher.verify(DUMMY_HASH, password);
      throw new AuthenticationError();
    }

    const { valid, needsRehash } = await this.hasher.verify(
      user.password,
      password,
    );

    if (!valid) {
      this.logger.warn(`Failed login attempt for ${user.email}`);
      throw new AuthenticationError();
    }

    if (needsRehash) await this.upgradeHash(user.id, password);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  /** Silent migration off the legacy digest. Never blocks the login. */
  private async upgradeHash(userId: string, password: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { password: await this.hasher.hash(password) },
      });
      this.logger.log(`Upgraded password hash to argon2id for user ${userId}`);
    } catch (err) {
      this.logger.error(
        `Could not upgrade password hash for ${userId}: ${String(err)}`,
      );
    }
  }
}
