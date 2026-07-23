import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { diskStorage } from "multer";
import { extname, join } from "node:path";
import { ApiBearerAuth, ApiConsumes, ApiTags } from "@nestjs/swagger";
import { DocumentsService } from "./documents.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("documents")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("documents")
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @UseInterceptors(
    FileInterceptor("file", {
      storage: diskStorage({
        destination: join(process.cwd(), "uploads"),
        filename: (_req: any, file: any, cb: any) =>
          cb(null, `${Date.now()}${extname(file.originalname)}`),
      }),
      limits: { fileSize: 25 * 1024 * 1024 },
    }),
  )
  upload(
    @UploadedFile() file: Express.Multer.File,
    @Body()
    body: {
      title?: string;
      docType?: string;
      source?: string;
      tags?: string;
      author?: string;
    },
  ) {
    return this.documents.upload({
      title: body.title ?? file.originalname,
      docType: body.docType,
      source: body.source,
      tags: body.tags ? body.tags.split(",").map((t) => t.trim()) : [],
      author: body.author,
      filePath: file.path,
      mimeType: file.mimetype,
    });
  }

  @Get() list() {
    return this.documents.list();
  }

  @Post(":id/reindex") reindex(@Param("id") id: string) {
    return this.documents.reindex(id);
  }

  @Delete(":id") remove(@Param("id") id: string) {
    return this.documents.remove(id);
  }
}
