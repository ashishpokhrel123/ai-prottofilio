import { Controller, Get, Param, Injectable, Module } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../common/config/prisma.service";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}
  findAll() {
    return this.prisma.project.findMany({ orderBy: { order: "asc" } });
  }
  findOne(slug: string) {
    return this.prisma.project.findUnique({ where: { slug } });
  }
}

@ApiTags("projects")
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}
  @Get() list() {
    return this.projects.findAll();
  }
  @Get(":slug") one(@Param("slug") slug: string) {
    return this.projects.findOne(slug);
  }
}

@Module({ providers: [ProjectsService], controllers: [ProjectsController] })
export class ProjectsModule {}
