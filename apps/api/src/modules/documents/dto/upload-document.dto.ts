import { ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsEnum, IsOptional, IsString, MaxLength } from "class-validator";
import { DocumentType, SourceType } from "@prisma/client";

/**
 * Multipart bodies arrive as strings, so `tags` is transformed from a
 * comma-separated field rather than typed as an array.
 */
export class UploadDocumentDto {
  @ApiPropertyOptional({ description: "Defaults to the uploaded filename." })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @ApiPropertyOptional({ enum: DocumentType })
  @IsOptional()
  @IsEnum(DocumentType, {
    message: `docType must be one of: ${Object.keys(DocumentType).join(", ")}`,
  })
  docType?: DocumentType;

  @ApiPropertyOptional({ enum: SourceType })
  @IsOptional()
  @IsEnum(SourceType, {
    message: `source must be one of: ${Object.keys(SourceType).join(", ")}`,
  })
  source?: SourceType;

  @ApiPropertyOptional({ description: "Comma-separated tags." })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === "string"
      ? value
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean)
      : value,
  )
  @IsString({ each: true })
  tags?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  author?: string;
}
