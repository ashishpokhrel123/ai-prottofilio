import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import {
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from "class-validator";

export class ChatDto {
  @ApiProperty({ description: "The visitor's question.", maxLength: 4000 })
  @IsString()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(1, { message: "Message cannot be empty." })
  // Bounded because every character becomes prompt tokens the owner pays for.
  @MaxLength(4000)
  message!: string;

  @ApiPropertyOptional({ description: "Existing conversation id to continue." })
  @IsOptional()
  @IsUUID(4, { message: "conversationId must be a UUID." })
  conversationId?: string;

  @ApiPropertyOptional({
    description: "Anonymous, client-generated session id used for analytics.",
  })
  @IsOptional()
  @IsUUID(4, { message: "visitorId must be a UUID." })
  visitorId?: string;
}
