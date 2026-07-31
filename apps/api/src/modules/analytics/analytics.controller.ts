import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AnalyticsService, type AnalyticsSummary } from "./analytics.service";
import { TrackEventDto } from "./dto/track-event.dto";

@ApiTags("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  /** Public: the frontend records anonymous visits and interactions. */
  @Post("event")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: "Record an anonymous analytics event." })
  async track(@Body() dto: TrackEventDto): Promise<{ accepted: true }> {
    await this.analytics.trackSafely(dto.type, dto.visitorId, dto.payload);
    return { accepted: true };
  }

  /** Aggregates reveal visitor behaviour, so this one is admin-only. */
  @Get()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Aggregate analytics for the admin dashboard." })
  summary(): Promise<AnalyticsSummary> {
    return this.analytics.summary();
  }
}
