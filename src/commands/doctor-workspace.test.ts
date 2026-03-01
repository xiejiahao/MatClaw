import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/config.js";
import {
  applyLegacyProfileWorkspaceConfigMigration,
  detectLegacyProfileWorkspaceMigration,
  moveLegacyProfileWorkspace,
} from "./doctor-workspace.js";

const tempDirs: string[] = [];

async function makeTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-doctor-workspace-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("detectLegacyProfileWorkspaceMigration", () => {
  it("returns null when profile is default", async () => {
    const home = await makeTempHome();
    const env = {
      HOME: home,
      OPENCLAW_PROFILE: "default",
      OPENCLAW_STATE_DIR: path.join(home, ".openclaw"),
    } as NodeJS.ProcessEnv;

    const migration = detectLegacyProfileWorkspaceMigration({ cfg: {}, env, homedir: () => home });
    expect(migration).toBeNull();
  });

  it("detects migratable legacy workspace and requests config update", async () => {
    const home = await makeTempHome();
    const stateDir = path.join(home, ".openclaw-work");
    const legacyWorkspace = path.join(home, ".openclaw", "workspace-work");
    await fs.mkdir(legacyWorkspace, { recursive: true });
    await fs.writeFile(path.join(legacyWorkspace, "AGENTS.md"), "hello\n", "utf-8");

    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          workspace: legacyWorkspace,
        },
      },
    };
    const env = {
      HOME: home,
      OPENCLAW_PROFILE: "work",
      OPENCLAW_STATE_DIR: stateDir,
    } as NodeJS.ProcessEnv;

    const migration = detectLegacyProfileWorkspaceMigration({ cfg, env, homedir: () => home });
    expect(migration).not.toBeNull();
    expect(migration?.canMigrate).toBe(true);
    expect(migration?.shouldUpdateConfig).toBe(true);
    expect(migration?.legacyWorkspace).toBe(path.resolve(legacyWorkspace));
    expect(migration?.targetWorkspace).toBe(path.resolve(path.join(stateDir, "workspace")));
  });

  it("marks migration as blocked when target workspace is non-empty", async () => {
    const home = await makeTempHome();
    const stateDir = path.join(home, ".openclaw-work");
    const legacyWorkspace = path.join(home, ".openclaw", "workspace-work");
    const targetWorkspace = path.join(stateDir, "workspace");

    await fs.mkdir(legacyWorkspace, { recursive: true });
    await fs.writeFile(path.join(legacyWorkspace, "AGENTS.md"), "legacy\n", "utf-8");
    await fs.mkdir(targetWorkspace, { recursive: true });
    await fs.writeFile(path.join(targetWorkspace, "AGENTS.md"), "target\n", "utf-8");

    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          workspace: legacyWorkspace,
        },
      },
    };
    const env = {
      HOME: home,
      OPENCLAW_PROFILE: "work",
      OPENCLAW_STATE_DIR: stateDir,
    } as NodeJS.ProcessEnv;

    const migration = detectLegacyProfileWorkspaceMigration({ cfg, env, homedir: () => home });
    expect(migration?.canMigrate).toBe(false);
    expect(migration?.blockedReason).toContain("Target workspace already contains files");
  });

  it("does not migrate when defaults workspace is explicitly custom", async () => {
    const home = await makeTempHome();
    const stateDir = path.join(home, ".openclaw-work");
    const legacyWorkspace = path.join(home, ".openclaw", "workspace-work");
    await fs.mkdir(legacyWorkspace, { recursive: true });
    await fs.writeFile(path.join(legacyWorkspace, "AGENTS.md"), "legacy\\n", "utf-8");

    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          workspace: "/tmp/custom-workspace",
        },
      },
    };
    const env = {
      HOME: home,
      OPENCLAW_PROFILE: "work",
      OPENCLAW_STATE_DIR: stateDir,
    } as NodeJS.ProcessEnv;

    const migration = detectLegacyProfileWorkspaceMigration({ cfg, env, homedir: () => home });
    expect(migration?.canMigrate).toBe(false);
    expect(migration?.blockedReason).toContain("explicitly set");
  });
});

describe("applyLegacyProfileWorkspaceConfigMigration", () => {
  it("removes agents.defaults.workspace when migration requires config update", () => {
    const cfg: OpenClawConfig = {
      agents: {
        defaults: {
          workspace: "/tmp/legacy",
        },
      },
    };

    const next = applyLegacyProfileWorkspaceConfigMigration(cfg, {
      profile: "work",
      activeWorkspace: "/tmp/legacy",
      legacyWorkspace: "/tmp/legacy",
      targetWorkspace: "/tmp/new-workspace",
      configuredWorkspace: "/tmp/legacy",
      targetState: "missing",
      shouldUpdateConfig: true,
      canMigrate: true,
    });

    expect(next.agents?.defaults?.workspace).toBeUndefined();
  });
});

describe("moveLegacyProfileWorkspace", () => {
  it("moves directory to new location without overwriting", async () => {
    const home = await makeTempHome();
    const source = path.join(home, "old");
    const destination = path.join(home, "new", "workspace");
    await fs.mkdir(source, { recursive: true });
    await fs.writeFile(path.join(source, "AGENTS.md"), "legacy\\n", "utf-8");

    await moveLegacyProfileWorkspace({ source, destination });

    await expect(fs.access(path.join(source, "AGENTS.md"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(fs.readFile(path.join(destination, "AGENTS.md"), "utf-8")).resolves.toBe(
      "legacy\\n",
    );
  });
});
