import {
  ExecutionContext,
  Injectable,
  Logger,
  type CanActivate,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { AppConfigService } from "../../common/config/app-config.service";

/**
 * JWT guard for admin and mutating routes.
 *
 * The previous implementation returned `true` whenever `NODE_ENV !==
 * "production"` — so every admin endpoint (document upload, re-index, GitHub
 * sync, analytics) was fully open on any host that didn't set NODE_ENV, which
 * several PaaS providers don't do by default.
 *
 * The bypass now requires an explicit `AUTH_DEV_BYPASS=true`, and the env
 * schema refuses to start a production build with that flag set — so it cannot
 * silently follow a deploy.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") implements CanActivate {
  private readonly logger = new Logger(JwtAuthGuard.name);
  private warned = false;

  constructor(private readonly config: AppConfigService) {
    super();
  }

  override canActivate(context: ExecutionContext) {
    if (this.config.auth.devBypass && !this.config.isProduction) {
      if (!this.warned) {
        this.warned = true;
        this.logger.warn(
          "AUTH_DEV_BYPASS is enabled — all protected routes are OPEN. " +
            "This is refused in production.",
        );
      }
      return true;
    }

    return super.canActivate(context);
  }
}
