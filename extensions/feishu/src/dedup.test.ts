import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tryRecordMessagePersistent } from "./dedup.js";

const ORIGINAL_ENV = { ...process.env };

let tempDir = "";

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-feishu-dedup-test-"));
});

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

describe("feishu dedup state dir resolution", () => {
  it("stores dedup files under OPENCLAW_STATE_DIR when provided", async () => {
    const stateDir = path.join(tempDir, "state");
    process.env.OPENCLAW_STATE_DIR = stateDir;

    const accepted = await tryRecordMessagePersistent(
      `message-${Date.now()}-state`,
      "profile-aware-state-dir",
    );

    expect(accepted).toBe(true);
    await expect(
      fs.access(path.join(stateDir, "feishu", "dedup", "profile-aware-state-dir.json")),
    ).resolves.toBeUndefined();
  });

  it("falls back to profile-suffixed state dir when OPENCLAW_STATE_DIR is unset", async () => {
    delete process.env.OPENCLAW_STATE_DIR;
    delete process.env.CLAWDBOT_STATE_DIR;
    process.env.OPENCLAW_PROFILE = "work";
    process.env.VITEST = "";
    process.env.NODE_ENV = "development";

    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(tempDir);

    const accepted = await tryRecordMessagePersistent(
      `message-${Date.now()}-profile`,
      "profile-aware-fallback",
    );

    expect(accepted).toBe(true);
    await expect(
      fs.access(
        path.join(tempDir, ".openclaw-work", "feishu", "dedup", "profile-aware-fallback.json"),
      ),
    ).resolves.toBeUndefined();
    homedirSpy.mockRestore();
  });
});
