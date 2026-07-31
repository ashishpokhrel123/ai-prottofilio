import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { AppConfigService } from "../../common/config/app-config.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { JwtStrategy } from "./jwt.strategy";
import { PasswordHasher } from "./password.hasher";

@Module({
  imports: [
    PassportModule,
    // Async registration so the signing secret comes from validated config
    // rather than a module-load-time `process.env` read.
    JwtModule.registerAsync({
      inject: [AppConfigService],
      useFactory: (config: AppConfigService) => ({
        secret: config.auth.jwtSecret,
        signOptions: { expiresIn: config.auth.jwtExpiresIn },
      }),
    }),
  ],
  providers: [AuthService, PasswordHasher, JwtStrategy, JwtAuthGuard],
  controllers: [AuthController],
  exports: [AuthService, PasswordHasher, JwtAuthGuard],
})
export class AuthModule {}
