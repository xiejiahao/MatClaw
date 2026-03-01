import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { OpenClawConfig, PluginRuntime } from "openclaw/plugin-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maybeCreateDynamicAgent } from "./dynamic-agent.js";
import type { DynamicAgentCreationConfig } from "./types.js";

const ORIGINAL_ENV = { ...process.env };

let tempDir = "";

beforeEach(async () => {
  tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-feishu-dynamic-agent-test-"));
});

afterEach(async () => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
  if (tempDir) {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
});

function createRuntimeStub(params: {
  stateDir?: string;
  throwOnResolveStateDir?: boolean;
  writes: OpenClawConfig[];
}): PluginRuntime {
  const { stateDir, throwOnResolveStateDir, writes } = params;
  return {
    state: {
      resolveStateDir: () => {
        if (throwOnResolveStateDir) {
          throw new Error("resolveStateDir failed");
        }
        return stateDir ?? path.join(tempDir, "fallback-state");
      },
    },
    config: {
      writeConfigFile: async (cfg: OpenClawConfig) => {
        writes.push(cfg);
      },
    },
  } as unknown as PluginRuntime;
}

describe("maybeCreateDynamicAgent", () => {
  it("uses runtime state dir for default workspace and agentDir templates", async () => {
    const stateDir = path.join(tempDir, ".openclaw-work");
    const writes: OpenClawConfig[] = [];
    const runtime = createRuntimeStub({ stateDir, writes });
    const senderOpenId = "ou_abc123";
    const dynamicCfg: DynamicAgentCreationConfig = {};

    const result = await maybeCreateDynamicAgent({
      cfg: {},
      runtime,
      senderOpenId,
      dynamicCfg,
      log: () => undefined,
    });

    const agentId = `feishu-${senderOpenId}`;
    const expectedWorkspace = path.join(stateDir, `workspace-${agentId}`);
    const expectedAgentDir = path.join(stateDir, "agents", agentId, "agent");

    expect(result.created).toBe(true);
    expect(result.agentId).toBe(agentId);
    expect(writes).toHaveLength(1);
    expect(result.updatedCfg.agents?.list?.[0]).toMatchObject({
      id: agentId,
      workspace: expectedWorkspace,
      agentDir: expectedAgentDir,
    });
    await expect(fs.access(expectedWorkspace)).resolves.toBeUndefined();
    await expect(fs.access(expectedAgentDir)).resolves.toBeUndefined();
  });

  it("falls back to profile-based state dir when runtime resolver fails", async () => {
    const writes: OpenClawConfig[] = [];
    const runtime = createRuntimeStub({ throwOnResolveStateDir: true, writes });
    process.env.OPENCLAW_PROFILE = "lab";
    const homedirSpy = vi.spyOn(os, "homedir").mockReturnValue(tempDir);

    const result = await maybeCreateDynamicAgent({
      cfg: {},
      runtime,
      senderOpenId: "ou_profile",
      dynamicCfg: {},
      log: () => undefined,
    });

    const agentId = "feishu-ou_profile";
    const expectedStateDir = path.join(tempDir, ".openclaw-lab");
    expect(result.updatedCfg.agents?.list?.[0]).toMatchObject({
      id: agentId,
      workspace: path.join(expectedStateDir, `workspace-${agentId}`),
      agentDir: path.join(expectedStateDir, "agents", agentId, "agent"),
    });
    homedirSpy.mockRestore();
  });
});
