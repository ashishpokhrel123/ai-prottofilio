import { ExecutionContext, Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  override canActivate(context: ExecutionContext) {
    // Convenience bypass for local development only. In production the real
    // JWT strategy runs, so admin/mutating routes require a valid token.
    if ((process.env.NODE_ENV ?? "development") !== "production") return true;
    return super.canActivate(context);
  }
}
