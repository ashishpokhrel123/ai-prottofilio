import { Global, Inject, Injectable, Module } from "@nestjs/common";
import { AppConfig, buildConfig } from "./configuration";
import { parseEnv } from "./env.schema";

export const APP_CONFIG = Symbol("APP_CONFIG");

/**
 * Typed, injectable access to application configuration.
 *
 * Deliberately not `@nestjs/config`'s `ConfigService`: that returns
 * `T | undefined` for every key and invites `?? default` noise at every call
 * site. Here the config is validated once and every getter is non-nullable.
 */
@Injectable()
export class AppConfigService {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  get all(): AppConfig {
    return this.config;
  }

  get nodeEnv(): AppConfig["nodeEnv"] {
    return this.config.nodeEnv;
  }
  get isProduction(): boolean {
    return this.config.isProduction;
  }
  get isServerless(): boolean {
    return this.config.isServerless;
  }
  get port(): number {
    return this.config.port;
  }
  get appUrl(): string {
    return this.config.appUrl;
  }
  get corsOrigins(): readonly string[] {
    return this.config.corsOrigins;
  }
  get logLevel(): AppConfig["logLevel"] {
    return this.config.logLevel;
  }
  get database(): AppConfig["database"] {
    return this.config.database;
  }
  get redis(): AppConfig["redis"] {
    return this.config.redis;
  }
  get auth(): AppConfig["auth"] {
    return this.config.auth;
  }
  get llmProvider(): AppConfig["llmProvider"] {
    return this.config.llmProvider;
  }
  get gemini(): AppConfig["gemini"] {
    return this.config.gemini;
  }
  get nvidia(): AppConfig["nvidia"] {
    return this.config.nvidia;
  }
  get rag(): AppConfig["rag"] {
    return this.config.rag;
  }
  get github(): AppConfig["github"] {
    return this.config.github;
  }
  get uploads(): AppConfig["uploads"] {
    return this.config.uploads;
  }
  get rateLimit(): AppConfig["rateLimit"] {
    return this.config.rateLimit;
  }
}

/**
 * Global config module. Validation happens exactly once here, at module
 * construction, so an invalid environment aborts bootstrap.
 */
@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: (): AppConfig => buildConfig(parseEnv(process.env)),
    },
    AppConfigService,
  ],
  exports: [APP_CONFIG, AppConfigService],
})
export class AppConfigModule {}
