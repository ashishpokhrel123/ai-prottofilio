import { Body, Controller, Logger, Post, Req, Res } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { ApiOperation, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { errorDetail, errorMessage } from "../../core/errors/domain.errors";
import { ChatService } from "./chat.service";
import { ChatDto } from "./dto/chat.dto";

/** Emitted periodically so proxies don't close an idle connection mid-answer. */
const KEEPALIVE_INTERVAL_MS = 15_000;

@ApiTags("chat")
@Controller("chat")
export class ChatController {
  private readonly logger = new Logger(ChatController.name);

  constructor(private readonly chat: ChatService) {}

  /**
   * Server-Sent Events endpoint. The browser reads token, tool and citation
   * events as they are produced.
   */
  @Post()
  @Throttle({ chat: { limit: 20, ttl: 60_000 } })
  @ApiOperation({
    summary: "Ask the portfolio agent (SSE streaming response).",
  })
  async ask(
    @Body() dto: ChatDto,
    @Req() request: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Without this, nginx buffers the whole stream and the client sees
      // nothing until the answer is complete.
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    // Propagates client disconnects into the agent so a closed tab stops
    // burning model tokens.
    const controller = new AbortController();
    request.on("close", () => controller.abort());

    const keepalive = setInterval(() => {
      if (!res.writableEnded) res.write(": keepalive\n\n");
    }, KEEPALIVE_INTERVAL_MS);

    try {
      for await (const chunk of this.chat.ask({
        message: dto.message,
        conversationId: dto.conversationId,
        visitorId: dto.visitorId,
        signal: controller.signal,
      })) {
        if (res.writableEnded) break;
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        this.logger.error(`Chat stream failed: ${errorDetail(err)}`);
        this.writeError(res, errorMessage(err));
      }
    } finally {
      clearInterval(keepalive);
      if (!res.writableEnded) {
        res.write("data: [DONE]\n\n");
        res.end();
      }
    }
  }

  private writeError(res: Response, detail: string): void {
    if (res.writableEnded) return;

    res.write(
      `data: ${JSON.stringify({
        type: "error",
        content: `The assistant hit an error and couldn't finish responding (${detail}).`,
      })}\n\n`,
    );
  }
}
