import { Controller, Post, UseGuards, Module } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { GithubService } from "./github.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { IngestionService } from "../../lib/embeddings/ingestion.service";

@ApiTags("github")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("github")
export class GithubController {
  constructor(private readonly github: GithubService) {}

  @Post("sync")
  sync() {
    return this.github.sync();
  }
}

@Module({
  providers: [GithubService, IngestionService],
  controllers: [GithubController],
})
export class GithubModule {}
