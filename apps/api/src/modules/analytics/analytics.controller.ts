import { Controller, Get, Post, Body, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AnalyticsService } from "./analytics.service";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";

@ApiTags("analytics")
@Controller("analytics")
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Post("event")
  track(
    @Body()
    body: {
      type: string;
      visitorId?: string;
      payload?: Record<string, unknown>;
    },
  ) {
    return this.analytics.track(body.type, body.visitorId, body.payload);
  }

  @Get()
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  summary() {
    return this.analytics.summary();
  }
}
