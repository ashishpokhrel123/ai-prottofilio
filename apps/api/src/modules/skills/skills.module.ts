import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  ApiBearerAuth,
  ApiOperation,
  ApiPropertyOptional,
  ApiTags,
} from "@nestjs/swagger";
import { IsIn, IsOptional } from "class-validator";
import type { Skill } from "@prisma/client";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import {
  SkillsExtractionService,
  type ExtractionResult,
} from "./skills.extraction";

const EXTRACTION_SOURCES = ["github", "resume"] as const;
type ExtractionSource = (typeof EXTRACTION_SOURCES)[number];

export class ExtractSkillsDto {
  @ApiPropertyOptional({
    enum: EXTRACTION_SOURCES,
    isArray: true,
    description: "Defaults to both sources.",
  })
  @IsOptional()
  @IsIn(EXTRACTION_SOURCES, { each: true })
  sources?: ExtractionSource[];
}

@Injectable()
export class SkillsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Skills grouped by category, ordered by proficiency within each group. */
  async grouped(): Promise<Record<string, Skill[]>> {
    const skills = await this.prisma.skill.findMany({
      orderBy: [{ category: "asc" }, { level: "desc" }, { name: "asc" }],
    });

    const grouped: Record<string, Skill[]> = {};
    for (const skill of skills) {
      (grouped[skill.category] ??= []).push(skill);
    }
    return grouped;
  }
}

@ApiTags("skills")
@Controller("skills")
export class SkillsController {
  constructor(
    private readonly skills: SkillsService,
    private readonly extraction: SkillsExtractionService,
  ) {}

  @Get()
  @ApiOperation({ summary: "List skills grouped by category." })
  list() {
    return this.skills.grouped();
  }

  /**
   * Derives skills from synced GitHub repos and/or the résumé, merging them
   * into the table. Additive only — existing skills are never removed.
   */
  @Post("extract")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Extract and merge skills from GitHub and the resume.",
  })
  async extract(
    @Body() dto: ExtractSkillsDto,
  ): Promise<{ results: ExtractionResult[] }> {
    const sources = dto.sources?.length ? dto.sources : [...EXTRACTION_SOURCES];
    const results: ExtractionResult[] = [];

    if (sources.includes("github")) {
      results.push(await this.extraction.extractFromGithub());
    }
    if (sources.includes("resume")) {
      results.push(await this.extraction.extractFromResume());
    }

    return { results };
  }
}

@Module({
  imports: [AuthModule],
  providers: [SkillsService, SkillsExtractionService],
  controllers: [SkillsController],
})
export class SkillsModule {}
