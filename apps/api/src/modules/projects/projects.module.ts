import {
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";

@Injectable()
export class ProjectsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.project.findMany({
      orderBy: [{ featured: "desc" }, { order: "asc" }],
    });
  }

  async findBySlug(slug: string) {
    const project = await this.prisma.project.findUnique({ where: { slug } });
    if (!project) throw new NotFoundException(`Project "${slug}" not found.`);
    return project;
  }
}

@ApiTags("projects")
@Controller("projects")
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  @Get()
  @ApiOperation({ summary: "List all projects, featured first." })
  list() {
    return this.projects.findAll();
  }

  @Get(":slug")
  @ApiOperation({ summary: "Fetch a single project by slug." })
  one(@Param("slug") slug: string) {
    return this.projects.findBySlug(slug);
  }
}

@Module({
  providers: [ProjectsService],
  controllers: [ProjectsController],
})
export class ProjectsModule {}
