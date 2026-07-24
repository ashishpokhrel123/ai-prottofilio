import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../common/config/prisma.service";
import { GeminiService } from "../../lib/llm/gemini.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  SkillsExtractionService,
  ExtractionResult,
} from "./skills.extraction";

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}
  async grouped() {
    const skills = await this.prisma.skill.findMany({
      orderBy: [{ category: "asc" }, { level: "desc" }],
    });
    return skills.reduce<Record<string, any>>(
      (acc: Record<string, any>, s: any) => {
        (acc[s.category] ??= []).push(s);
        return acc;
      },
      {},
    );
  }
}

@ApiTags("skills")
@Controller("skills")
export class SkillsController {
  constructor(
    private readonly skills: SkillsService,
    private readonly extraction: SkillsExtractionService,
  ) {}

  @Get() list() {
    return this.skills.grouped();
  }

  /**
   * Extract skills from GitHub (synced repo languages/topics) and/or the
   * resume (via Gemini), merging them into the Skill table.
   * Body: { "sources"?: ("github" | "resume")[] } — defaults to both.
   */
  @Post("extract")
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async extract(
    @Body() body: { sources?: ("github" | "resume")[] },
  ): Promise<{ results: ExtractionResult[] }> {
    const sources = body?.sources?.length ? body.sources : ["github", "resume"];
    const results: ExtractionResult[] = [];
    if (sources.includes("github"))
      results.push(await this.extraction.extractFromGithub());
    if (sources.includes("resume"))
      results.push(await this.extraction.extractFromResume());
    return { results };
  }
}

@Module({
  providers: [SkillsService, SkillsExtractionService, GeminiService],
  controllers: [SkillsController],
})
export class SkillsModule {}
