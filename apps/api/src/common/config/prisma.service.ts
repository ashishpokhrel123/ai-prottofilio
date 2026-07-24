import { Injectable, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import * as path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super({
      datasources: process.env.DATABASE_URL
        ? { db: { url: process.env.DATABASE_URL } }
        : undefined,
    });
  }
  async onModuleInit(): Promise<void> {
    try {
      await this.$connect();
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[PrismaService] Failed to connect to database on startup:", err.message);
    }
  }

  async onModuleDestroy(): Promise<void> {
    try {
      await this.$disconnect();
    } catch {}
  }
}
