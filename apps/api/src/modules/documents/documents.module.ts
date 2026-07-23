import { Module } from "@nestjs/common";
import { DocumentsService } from "./documents.service";
import { DocumentsController } from "./documents.controller";
import { IngestionService } from "../../lib/embeddings/ingestion.service";

@Module({
  providers: [DocumentsService, IngestionService],
  controllers: [DocumentsController],
  exports: [DocumentsService, IngestionService],
})
export class DocumentsModule {}
