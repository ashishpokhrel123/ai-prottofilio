import {
  Controller,
  Get,
  Res,
  Injectable,
  Module,
  NotFoundException,
} from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { existsSync, createReadStream } from "node:fs";
import { join } from "node:path";
import { AnalyticsModule } from "../analytics/analytics.module";
import { AnalyticsService } from "../analytics/analytics.service";

const RESUME_PATH = join(
  process.cwd(),
  "knowledge",
  "resume",
  "ashish-pokhrel-resume.pdf",
);

@Injectable()
export class ResumeService {
  constructor(private readonly analytics: AnalyticsService) {}
  stream(res: Response) {
    if (!existsSync(RESUME_PATH))
      throw new NotFoundException("Resume not uploaded yet.");
    void this.analytics.track("download_resume");
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="Ashish-Pokhrel-Resume.pdf"',
    );
    createReadStream(RESUME_PATH).pipe(res);
  }
}

@ApiTags("resume")
@Controller("resume")
export class ResumeController {
  constructor(private readonly resume: ResumeService) {}
  @Get() download(@Res() res: Response) {
    this.resume.stream(res);
  }
}

@Module({
  imports: [AnalyticsModule],
  providers: [ResumeService],
  controllers: [ResumeController],
})
export class ResumeModule {}
