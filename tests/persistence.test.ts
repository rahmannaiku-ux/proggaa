import { describe, expect, it, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// FileStore reads PERSISTENCE_DIR from config/env.ts at import time, so it
// must be set before that module (or anything importing it) is loaded.
// Vitest isolates modules per test file by default, so setting it here,
// before any import below, is enough — no cross-file leakage.
let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "proggaa-persist-test-"));
  process.env.PERSISTENCE_DIR = tmpDir;
});

afterAll(() => {
  delete process.env.PERSISTENCE_DIR;
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("FileStore", () => {
  it("persists mutations to disk and a fresh instance reads them back", async () => {
    const { FileStore } = await import("../src/utils/persistence");

    const first = new FileStore<{ count: number }>("counter.json", { count: 0 });
    expect(first.data.count).toBe(0);
    first.data.count = 5;
    first.save();

    const second = new FileStore<{ count: number }>("counter.json", { count: 0 });
    expect(second.data.count).toBe(5);
  });

  it("falls back to the default value when the file doesn't exist yet", async () => {
    const { FileStore } = await import("../src/utils/persistence");
    const store = new FileStore<{ items: string[] }>("does-not-exist-yet.json", { items: [] });
    expect(store.data.items).toEqual([]);
  });
});
