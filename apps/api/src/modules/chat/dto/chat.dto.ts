import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class ChatDto {
  @ApiPropertyOptional({ description: "Existing conversation id to continue." })
  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @ApiProperty({ description: "The visitor question.", maxLength: 4000 })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({
    description: "Anonymous visitor/session id for analytics.",
  })
  @IsOptional()
  @IsString()
  visitorId?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  stream?: boolean;
}
