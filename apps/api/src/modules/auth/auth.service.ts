import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { createHash } from "node:crypto";
import { PrismaService } from "../../common/config/prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  private hash(password: string): string {
    return createHash("sha256").update(password).digest("hex");
  }

  async validate(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || user.password !== this.hash(password)) {
      throw new UnauthorizedException("Invalid credentials");
    }
    return user;
  }

  async login(email: string, password: string) {
    const user = await this.validate(email, password);
    const token = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      role: user.role,
    });
    return {
      accessToken: token,
      user: { id: user.id, email: user.email, name: user.name },
    };
  }
}
