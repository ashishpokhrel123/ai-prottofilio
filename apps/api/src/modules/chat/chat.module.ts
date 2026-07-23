import { Module } from "@nestjs/common";
import { ChatController } from "./chat.controller";
import { ChatGateway } from "./chat.gateway";
import { ChatService } from "./chat.service";
import { AnalyticsModule } from "../analytics/analytics.module";

@Module({
  imports: [AnalyticsModule],
  controllers: [ChatController],
  providers: [ChatService, ChatGateway],
})
export class ChatModule {}
