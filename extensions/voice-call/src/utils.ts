import os from "node:os";
import path from "node:path";

export function resolveUserPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return trimmed;
  }
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, os.homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

export function resolveStateDirFromEnv(env: NodeJS.ProcessEnv = process.env): string {
  const stateOverride = env.OPENCLAW_STATE_DIR?.trim() || env.CLAWDBOT_STATE_DIR?.trim();
  if (stateOverride) {
    return resolveUserPath(stateOverride);
  }
  const profile = env.OPENCLAW_PROFILE?.trim() || env.CLAWDBOT_PROFILE?.trim();
  const suffix = profile && profile.toLowerCase() !== "default" ? `-${profile}` : "";
  return path.join(os.homedir(), `.openclaw${suffix}`);
}
