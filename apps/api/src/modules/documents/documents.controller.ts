import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from "@nestjs/swagger";
import { AppConfigService } from "../../common/config/app-config.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DocumentsService } from "./documents.service";
import { UploadDocumentDto } from "./dto/upload-document.dto";

@ApiTags("documents")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller("documents")
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly config: AppConfigService,
  ) {}

  /**
   * Uploads go through multer's memory storage, not disk storage.
   *
   * The previous `diskStorage` wrote straight to `process.cwd()/uploads` with
   * a client-influenced filename, which bypassed the storage abstraction and
   * only worked on a host with a writable, persistent filesystem. Buffering in
   * memory and handing bytes to `FileStoragePort` keeps the choice of backend
   * a deployment decision. The 25 MB cap bounds the memory cost.
   */
  @Post("upload")
  @ApiConsumes("multipart/form-data")
  @ApiOperation({ summary: "Upload a document and queue it for ingestion." })
  // Storage and size limits come from MulterModule.registerAsync in the
  // module, so they derive from validated config rather than being hardcoded.
  @UseInterceptors(FileInterceptor("file"))
  upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
  ) {
    if (!file) throw new BadRequestException("A file is required.");

    if (file.size > this.config.uploads.maxBytes) {
      throw new BadRequestException(
        `File exceeds the ${Math.floor(this.config.uploads.maxBytes / 1024 / 1024)} MB limit.`,
      );
    }

    return this.documents.upload({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      title: dto.title,
      docType: dto.docType,
      source: dto.source,
      tags: dto.tags,
      author: dto.author,
    });
  }

  @Get()
  @ApiOperation({ summary: "List all documents with their indexing status." })
  list() {
    return this.documents.list();
  }

  @Post(":id/reindex")
  @ApiOperation({
    summary: "Re-chunk and re-embed a document from its source file.",
  })
  reindex(@Param("id", ParseUUIDPipe) id: string) {
    return this.documents.reindex(id);
  }

  @Delete(":id")
  @ApiOperation({
    summary: "Delete a document, its chunks, and its stored file.",
  })
  remove(@Param("id", ParseUUIDPipe) id: string) {
    return this.documents.remove(id);
  }
}
