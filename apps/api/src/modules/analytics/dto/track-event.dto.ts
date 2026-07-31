import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsIn, IsObject, IsOptional, IsUUID } from "class-validator";
import {
  ANALYTICS_EVENTS,
  type AnalyticsEventType,
} from "../analytics.service";

export class TrackEventDto {
  @ApiProperty({ enum: ANALYTICS_EVENTS })
  // This endpoint is public and unauthenticated; without the allow-list a
  // scraper could write arbitrary event types straight into the table.
  @IsIn(ANALYTICS_EVENTS, {
    message: `type must be one of: ${ANALYTICS_EVENTS.join(", ")}`,
  })
  type!: AnalyticsEventType;

  @ApiPropertyOptional({
    description: "Anonymous client-generated session id.",
  })
  @IsOptional()
  @IsUUID(4)
  visitorId?: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;
}
