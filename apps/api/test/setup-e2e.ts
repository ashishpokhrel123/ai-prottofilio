/**
 * Deterministic environment for the e2e suite.
 *
 * Set before any module loads, so config validation sees these rather than a
 * developer's `.env` — otherwise the suite would pass or fail depending on
 * whose machine it ran on.
 */
process.env.NODE_ENV = "test";
process.env.DATABASE_URL =
  "postgresql://test:test@127.0.0.1:5432/test?schema=public";
process.env.JWT_SECRET = "e2e-only-secret-value-at-least-32-characters-long";
process.env.APP_URL = "http://localhost:3000";
process.env.LOG_LEVEL = "silent";

// No Redis: the queue port is replaced by a fake, and this keeps the
// infrastructure module from constructing a real BullMQ connection.
delete process.env.REDIS_URL;

// Must be unset so the LLM adapter reports "not configured" if a test ever
// reaches the real one instead of the fake.
process.env.GEMINI_API_KEY = "";

// The auth bypass must never be active in tests — the guard assertions in
// api.e2e-spec.ts would silently pass for the wrong reason.
process.env.AUTH_DEV_BYPASS = "false";
