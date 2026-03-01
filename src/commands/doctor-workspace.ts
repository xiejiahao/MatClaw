import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveAgentWorkspaceDir, resolveDefaultAgentId } from "../agents/agent-scope.js";
import { DEFAULT_AGENTS_FILENAME } from "../agents/workspace.js";
import type { OpenClawConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { resolveRequiredHomeDir } from "../infra/home-dir.js";
import { shortenHomePath } from "../utils.js";

export const MEMORY_SYSTEM_PROMPT = [
  "Memory system not found in workspace.",
  "Paste this into your agent:",
  "",
  "Install the memory system by applying:",
  "https://github.com/openclaw/openclaw/commit/9ffea23f31ca1df5183b25668f8f814bee0fb34e",
  "https://github.com/openclaw/openclaw/commit/7d1fee70e76f2f634f1b41fca927ee663914183a",
].join("\n");

export async function shouldSuggestMemorySystem(workspaceDir: string): Promise<boolean> {
  const memoryPaths = [path.join(workspaceDir, "MEMORY.md"), path.join(workspaceDir, "memory.md")];

  for (const memoryPath of memoryPaths) {
    try {
      await fs.promises.access(memoryPath);
      return false;
    } catch {
      // keep scanning
    }
  }

  const agentsPath = path.join(workspaceDir, DEFAULT_AGENTS_FILENAME);
  try {
    const content = await fs.promises.readFile(agentsPath, "utf-8");
    if (/memory\.md/i.test(content)) {
      return false;
    }
  } catch {
    // no AGENTS.md or unreadable; treat as missing memory guidance
  }

  return true;
}

type WorkspaceDirState = "missing" | "empty" | "non-empty";

export type LegacyProfileWorkspaceMigration = {
  profile: string;
  activeWorkspace: string;
  legacyWorkspace: string;
  targetWorkspace: string;
  configuredWorkspace: string | null;
  targetState: WorkspaceDirState;
  shouldUpdateConfig: boolean;
  canMigrate: boolean;
  blockedReason?: string;
};

function normalizeProfile(profileRaw: string | undefined): string | null {
  const profile = profileRaw?.trim();
  if (!profile || profile.toLowerCase() === "default") {
    return null;
  }
  return profile;
}

function isExistingDir(dir: string): boolean {
  try {
    return fs.statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

function detectWorkspaceDirState(dir: string): WorkspaceDirState {
  if (!isExistingDir(dir)) {
    return "missing";
  }
  try {
    const entries = fs.readdirSync(dir);
    return entries.length === 0 ? "empty" : "non-empty";
  } catch {
    return "non-empty";
  }
}

export function detectLegacyProfileWorkspaceMigration(params: {
  cfg: OpenClawConfig;
  env?: NodeJS.ProcessEnv;
  homedir?: () => string;
}): LegacyProfileWorkspaceMigration | null {
  const env = params.env ?? process.env;
  const homedir = params.homedir ?? os.homedir;
  const profile = normalizeProfile(env.OPENCLAW_PROFILE);
  if (!profile) {
    return null;
  }

  const home = resolveRequiredHomeDir(env, homedir);
  const legacyWorkspace = path.resolve(path.join(home, ".openclaw", `workspace-${profile}`));
  if (!isExistingDir(legacyWorkspace)) {
    return null;
  }

  const stateDir = resolveStateDir(env, () => resolveRequiredHomeDir(env, homedir));
  const targetWorkspace = path.resolve(path.join(stateDir, "workspace"));
  const activeWorkspace = path.resolve(
    resolveAgentWorkspaceDir(params.cfg, resolveDefaultAgentId(params.cfg)),
  );

  const defaultsWorkspaceRaw = params.cfg.agents?.defaults?.workspace;
  const configuredWorkspace =
    typeof defaultsWorkspaceRaw === "string" && defaultsWorkspaceRaw.trim()
      ? path.resolve(defaultsWorkspaceRaw)
      : null;
  const targetState = detectWorkspaceDirState(targetWorkspace);
  const usesLegacyByConfig = configuredWorkspace === legacyWorkspace;
  const implicitDefault = configuredWorkspace === null;
  const shouldUpdateConfig = usesLegacyByConfig;

  let canMigrate = false;
  let blockedReason: string | undefined;
  if (
    configuredWorkspace &&
    configuredWorkspace !== legacyWorkspace &&
    configuredWorkspace !== targetWorkspace
  ) {
    blockedReason = `Default workspace is explicitly set to ${shortenHomePath(configuredWorkspace)}.`;
  } else if (targetState === "non-empty") {
    blockedReason = `Target workspace already contains files: ${shortenHomePath(targetWorkspace)}.`;
  } else if (usesLegacyByConfig || implicitDefault || activeWorkspace === legacyWorkspace) {
    canMigrate = true;
  } else {
    blockedReason = "No migration action needed.";
  }

  return {
    profile,
    activeWorkspace,
    legacyWorkspace,
    targetWorkspace,
    configuredWorkspace,
    targetState,
    shouldUpdateConfig,
    canMigrate,
    blockedReason,
  };
}

export function formatLegacyProfileWorkspaceMigrationPreview(
  migration: LegacyProfileWorkspaceMigration,
): string {
  const targetStateLabel =
    migration.targetState === "missing"
      ? "not created"
      : migration.targetState === "empty"
        ? "empty"
        : "has files";
  const lines = [
    `Profile: ${migration.profile}`,
    `Current workspace: ${shortenHomePath(migration.activeWorkspace)}`,
    `New default: ${shortenHomePath(migration.targetWorkspace)}`,
    `Target: ${targetStateLabel}`,
  ];
  if (migration.configuredWorkspace) {
    if (migration.configuredWorkspace !== migration.activeWorkspace) {
      lines.push(`Configured: ${shortenHomePath(migration.configuredWorkspace)}`);
    }
  }
  if (migration.shouldUpdateConfig) {
    lines.push("Will update: agents.defaults.workspace");
  }
  if (!migration.canMigrate && migration.blockedReason) {
    lines.push(`Blocked: ${migration.blockedReason}`);
  }
  return lines.join("\n");
}

export async function moveLegacyProfileWorkspace(params: {
  source: string;
  destination: string;
}): Promise<void> {
  await fs.promises.mkdir(path.dirname(params.destination), { recursive: true });
  await fs.promises.rename(params.source, params.destination);
}

export function applyLegacyProfileWorkspaceConfigMigration(
  cfg: OpenClawConfig,
  migration: LegacyProfileWorkspaceMigration,
): OpenClawConfig {
  if (!migration.shouldUpdateConfig) {
    return cfg;
  }
  const { workspace: _removed, ...restDefaults } = cfg.agents?.defaults ?? {};
  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: restDefaults,
    },
  };
}
