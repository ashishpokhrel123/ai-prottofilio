import { Controller, Module, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { AuthModule } from "../auth/auth.module";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { GithubService } from "./github.service";

@ApiTags("github")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("github")
export class GithubController {
  constructor(private readonly github: GithubService) {}

  @Post("sync")
  @ApiOperation({
    summary: "Fetch public repositories and READMEs, then index them.",
  })
  sync() {
    return this.github.sync();
  }
}

@Module({
  imports: [AuthModule],
  providers: [GithubService],
  controllers: [GithubController],
})
export class GithubModule {}
