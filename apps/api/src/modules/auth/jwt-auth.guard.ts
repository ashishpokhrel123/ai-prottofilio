import { Injectable } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";

@Injectable()
export class JwtAuthGuard extends AuthGuard("jwt") {
  override canActivate() {
    // Admin auth bypassed for development
    return true;
  }
}
