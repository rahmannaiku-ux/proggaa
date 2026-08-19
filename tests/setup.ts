// Loaded by vitest before each test file's own imports run (see
// vitest.config.ts `setupFiles`). Several modules import `config/env.ts`
// at module load time, and that file calls `process.exit(1)` if BOT_TOKEN
// is missing — which would kill the whole test runner, not just fail a
// test. Setting a dummy token here keeps tests hermetic without requiring
// a real .env file in CI.
process.env.BOT_TOKEN ??= "test-token-for-vitest";
process.env.NODE_ENV = "test";
process.env.LOG_LEVEL ??= "error"; // keep test output quiet
