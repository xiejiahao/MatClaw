import fs from "node:fs";
import path from "node:path";
import {
  resolveExecApprovalsPath,
  resolveExecApprovalsSocketPath,
  resolveLegacyExecApprovalsPath,
  resolveLegacyExecApprovalsSocketPath,
  type ExecApprovalsFile,
} from "../infra/exec-approvals.js";
import { shortenHomePath } from "../utils.js";

type FileState = "missing" | "present";

export type LegacyExecApprovalsMigration = {
  legacyPath: string;
  targetPath: string;
  legacySocketPath: string;
  targetSocketPath: string;
  targetState: FileState;
  canMigrate: boolean;
  blockedReason?: string;
};

function isExistingFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function readFileState(filePath: string): FileState {
  return isExistingFile(filePath) ? "present" : "missing";
}

export function detectLegacyExecApprovalsMigration(
  env: NodeJS.ProcessEnv = process.env,
): LegacyExecApprovalsMigration | null {
  const legacyPath = path.resolve(resolveLegacyExecApprovalsPath(env));
  const targetPath = path.resolve(resolveExecApprovalsPath(env));
  if (legacyPath === targetPath) {
    return null;
  }
  if (!isExistingFile(legacyPath)) {
    return null;
  }

  const targetState = readFileState(targetPath);
  const canMigrate = targetState === "missing";
  const blockedReason =
    targetState === "present"
      ? `Target file already exists: ${shortenHomePath(targetPath)}.`
      : undefined;

  return {
    legacyPath,
    targetPath,
    legacySocketPath: path.resolve(resolveLegacyExecApprovalsSocketPath(env)),
    targetSocketPath: path.resolve(resolveExecApprovalsSocketPath(env)),
    targetState,
    canMigrate,
    blockedReason,
  };
}

export function formatLegacyExecApprovalsMigrationPreview(
  migration: LegacyExecApprovalsMigration,
): string {
  const lines = [
    `Current file: ${shortenHomePath(migration.legacyPath)}`,
    `New default: ${shortenHomePath(migration.targetPath)}`,
    `Target: ${migration.targetState === "missing" ? "not created" : "present"}`,
  ];
  if (!migration.canMigrate && migration.blockedReason) {
    lines.push(`Blocked: ${migration.blockedReason}`);
  }
  return lines.join("\n");
}

function rewriteSocketPathIfNeeded(params: {
  filePath: string;
  legacySocketPath: string;
  targetSocketPath: string;
}): boolean {
  let raw: string;
  try {
    raw = fs.readFileSync(params.filePath, "utf8");
  } catch {
    return false;
  }
  let parsed: ExecApprovalsFile;
  try {
    parsed = JSON.parse(raw) as ExecApprovalsFile;
  } catch {
    return false;
  }

  const socketPathRaw = parsed.socket?.path?.trim();
  const socketPath = socketPathRaw ? path.resolve(socketPathRaw) : null;
  if (!socketPath || socketPath !== params.legacySocketPath) {
    return false;
  }

  const next: ExecApprovalsFile = {
    ...parsed,
    socket: {
      ...parsed.socket,
      path: params.targetSocketPath,
    },
  };
  fs.writeFileSync(params.filePath, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return true;
}

export async function moveLegacyExecApprovalsFile(
  migration: LegacyExecApprovalsMigration,
): Promise<{ rewroteSocketPath: boolean }> {
  await fs.promises.mkdir(path.dirname(migration.targetPath), { recursive: true });
  await fs.promises.rename(migration.legacyPath, migration.targetPath);
  const rewroteSocketPath = rewriteSocketPathIfNeeded({
    filePath: migration.targetPath,
    legacySocketPath: migration.legacySocketPath,
    targetSocketPath: migration.targetSocketPath,
  });
  return { rewroteSocketPath };
}
