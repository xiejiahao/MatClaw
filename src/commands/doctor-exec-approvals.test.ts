import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  detectLegacyExecApprovalsMigration,
  moveLegacyExecApprovalsFile,
} from "./doctor-exec-approvals.js";

const tempDirs: string[] = [];

async function makeTempHome(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-doctor-exec-approvals-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true })));
});

describe("detectLegacyExecApprovalsMigration", () => {
  it("detects legacy file when target is missing", async () => {
    const home = await makeTempHome();
    const env = {
      HOME: home,
      OPENCLAW_PROFILE: "work",
      OPENCLAW_STATE_DIR: path.join(home, ".openclaw-work"),
    } as NodeJS.ProcessEnv;
    const legacyPath = path.join(home, ".openclaw", "exec-approvals.json");
    await fs.mkdir(path.dirname(legacyPath), { recursive: true });
    await fs.writeFile(legacyPath, '{"version":1,"socket":{"path":"/tmp/a.sock","token":"x"}}\n');

    const migration = detectLegacyExecApprovalsMigration(env);
    expect(migration).not.toBeNull();
    expect(migration?.canMigrate).toBe(true);
    expect(migration?.targetState).toBe("missing");
  });

  it("blocks migration when target file already exists", async () => {
    const home = await makeTempHome();
    const env = {
      HOME: home,
      OPENCLAW_PROFILE: "work",
      OPENCLAW_STATE_DIR: path.join(home, ".openclaw-work"),
    } as NodeJS.ProcessEnv;
    const legacyPath = path.join(home, ".openclaw", "exec-approvals.json");
    const targetPath = path.join(home, ".openclaw-work", "exec-approvals.json");
    await fs.mkdir(path.dirname(legacyPath), { recursive: true });
    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    await fs.writeFile(legacyPath, '{"version":1}\n');
    await fs.writeFile(targetPath, '{"version":1}\n');

    const migration = detectLegacyExecApprovalsMigration(env);
    expect(migration?.canMigrate).toBe(false);
    expect(migration?.blockedReason).toContain("Target file already exists");
  });
});

describe("moveLegacyExecApprovalsFile", () => {
  it("moves file and rewrites legacy socket path to profile default", async () => {
    const home = await makeTempHome();
    const env = {
      HOME: home,
      OPENCLAW_PROFILE: "work",
      OPENCLAW_STATE_DIR: path.join(home, ".openclaw-work"),
    } as NodeJS.ProcessEnv;
    const legacySocketPath = path.join(home, ".openclaw", "exec-approvals.sock");
    const legacyPath = path.join(home, ".openclaw", "exec-approvals.json");
    await fs.mkdir(path.dirname(legacyPath), { recursive: true });
    await fs.writeFile(
      legacyPath,
      JSON.stringify(
        { version: 1, socket: { path: legacySocketPath, token: "x" }, defaults: {}, agents: {} },
        null,
        2,
      ) + "\n",
    );

    const migration = detectLegacyExecApprovalsMigration(env);
    expect(migration).not.toBeNull();
    if (!migration) {
      return;
    }
    const result = await moveLegacyExecApprovalsFile(migration);
    expect(result.rewroteSocketPath).toBe(true);

    await expect(fs.access(legacyPath)).rejects.toMatchObject({ code: "ENOENT" });
    const movedRaw = await fs.readFile(migration.targetPath, "utf-8");
    // Parse JSON to avoid Windows backslash escaping issues with toContain
    const movedData = JSON.parse(movedRaw) as { socket?: { path?: string } };
    expect(movedData.socket?.path).toBe(path.join(home, ".openclaw-work", "exec-approvals.sock"));
  });
});
