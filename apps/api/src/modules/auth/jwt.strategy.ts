import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy, type StrategyOptions } from "passport-jwt";
import { AppConfigService } from "../../common/config/app-config.service";

export interface JwtPayload {
  /** User id. */
  readonly sub: string;
  readonly email: string;
  readonly role: string;
}

/**
 * Validates bearer tokens.
 *
 * The secret comes from validated config, not from `process.env` with a
 * `?? "dev-secret"` fallback — a default signing key that reaches production
 * lets anyone mint an admin token.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: AppConfigService) {
    const options: StrategyOptions = {
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.auth.jwtSecret,
    };
    super(options);
  }

  /** Passport attaches the return value to `request.user`. */
  validate(payload: JwtPayload): JwtPayload {
    return payload;
  }
}
