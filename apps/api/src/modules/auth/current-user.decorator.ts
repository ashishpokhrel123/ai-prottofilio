import { createParamDecorator, type ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import type { JwtPayload } from "./jwt.strategy";

/**
 * Injects the authenticated user's token claims into a handler parameter.
 *
 * Typed, so controllers never reach into `request.user` — which TypeScript
 * types as `any` and would erase the JWT payload's shape at every call site.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user as JwtPayload;
  },
);
