import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import {
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  StreamableFile,
  Res,
} from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Response } from "express";
import { AnalyticsModule } from "../analytics/analytics.module";
import { AnalyticsService } from "../analytics/analytics.service";

const RESUME_FILENAME = "Ashish-Pokhrel-Resume.pdf";

@Injectable()
export class ResumeService {
  /**
   * Resolved once at construction. `RESUME_PATH` lets the container mount the
   * résumé anywhere instead of requiring a fixed `knowledge/` layout inside
   * the image.
   */
  private readonly path = resolvePath();

  constructor(private readonly analytics: AnalyticsService) {}

  async open(): Promise<{ file: StreamableFile; size: number }> {
    const stats = await stat(this.path).catch(() => null);

    if (!stats?.isFile()) {
      throw new NotFoundException(
        "No resume has been uploaded yet. Place the PDF at knowledge/resume/ or set RESUME_PATH.",
      );
    }

    void this.analytics.trackSafely("download_resume");

    // Streamed rather than buffered: no reason to hold a PDF in memory.
    return {
      file: new StreamableFile(createReadStream(this.path)),
      size: stats.size,
    };
  }
}

@ApiTags("resume")
@Controller("resume")
export class ResumeController {
  constructor(private readonly resume: ResumeService) {}

  @Get()
  @ApiOperation({ summary: "Download the resume PDF." })
  async download(
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const { file, size } = await this.resume.open();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": String(size),
      "Content-Disposition": `attachment; filename="${RESUME_FILENAME}"`,
      "Cache-Control": "public, max-age=3600",
    });

    return file;
  }
}

function resolvePath(): string {
  const configured = process.env.RESUME_PATH;
  if (configured) {
    return isAbsolute(configured)
      ? configured
      : resolve(process.cwd(), configured);
  }
  return join(
    process.cwd(),
    "knowledge",
    "resume",
    "ashish-pokhrel-resume.pdf",
  );
}

@Module({
  imports: [AnalyticsModule],
  providers: [ResumeService],
  controllers: [ResumeController],
})
export class ResumeModule {}
