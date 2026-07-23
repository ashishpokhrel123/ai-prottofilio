import { Controller, Get, Injectable, Module } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../common/config/prisma.service";

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
  constructor(private readonly skills: SkillsService) {}
  @Get() list() {
    return this.skills.grouped();
  }
}

@Module({ providers: [SkillsService], controllers: [SkillsController] })
export class SkillsModule {}
