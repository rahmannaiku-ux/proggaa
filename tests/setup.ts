// Loaded by vitest before each test file's own imports run (see
// vitest.config.ts `setupFiles`). Several modules import `config/env.ts`
// at module load time, and that file calls `process.exit(1)` if BOT_TOKEN
// is missing — which would kill the whole test runner, not just fail a
// test. Setting a dummy token here keeps tests hermetic without requiring
// a real .env file in CI.
process.env.BOT_TOKEN ??= "test-token-for-vitest";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL ??= "error"; // keep test output quiet

// Tests always run on the in-memory demo data, even if a developer has a real .env with
// PROGGAA_PROVIDER=api (dotenv never overrides variables that are already set).
process.env.PROGGAA_PROVIDER = "mock";
for (const name of ["USER", "COURSE", "EXAM", "RESULT", "PAYMENT", "NOTIFICATION", "AI", "ADMIN", "LINK", "ACHIEVEMENT"]) {
  process.env[`PROGGAA_${name}_PROVIDER`] = "mock";
}
