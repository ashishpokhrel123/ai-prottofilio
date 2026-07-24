import { Body, Controller, Logger, Post, Res } from "@nestjs/common";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import { Response } from "express";
import { ChatService } from "./chat.service";
import { ChatDto } from "./dto/chat.dto";

@ApiTags("chat")
@Controller("chat")
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chat: ChatService) {}

  /**
   * Server-Sent Events streaming endpoint. The browser reads token/tool/citation
   * events as they arrive. (A Socket.IO gateway offers the same over WS.)
   */
  @Post()
  @ApiOperation({
    summary: "Ask the portfolio agent (SSE streaming response).",
  })
  async ask(@Body() dto: ChatDto, @Res() res: Response): Promise<void> {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    try {
      for await (const chunk of this.chat.ask({
        message: dto.message,
        conversationId: dto.conversationId,
        visitorId: dto.visitorId,
      })) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      // Surface the real cause in the server logs — an empty catch here is
      // what turned every backend fault into an opaque "stream failed".
      this.logger.error(
        `chat stream failed: ${
          err instanceof Error ? err.stack ?? err.message : String(err)
        }`,
      );
      const detail =
        err instanceof Error ? err.message : "unexpected server error";
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          content: `The assistant hit an error and couldn't finish responding (${detail}).`,
        })}\n\n`,
      );
    } finally {
      res.write("data: [DONE]\n\n");
      res.end();
    }
  }
}
