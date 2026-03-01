import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveDefaultAgentWorkspaceDir } from "./workspace.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("DEFAULT_AGENT_WORKSPACE_DIR", () => {
  it("uses OPENCLAW_HOME when resolving the default workspace dir", () => {
    const home = path.join(path.sep, "srv", "openclaw-home");
    vi.stubEnv("OPENCLAW_HOME", home);
    vi.stubEnv("HOME", path.join(path.sep, "home", "other"));
    // Clear state dir override so resolveStateDir falls back to OPENCLAW_HOME
    vi.stubEnv("OPENCLAW_STATE_DIR", "");

    expect(resolveDefaultAgentWorkspaceDir()).toBe(
      path.join(path.resolve(home), ".openclaw", "workspace"),
    );
  });

  it("resolves profile workspace under profile state dir", () => {
    const home = path.join(path.sep, "srv", "openclaw-home");
    vi.stubEnv("OPENCLAW_HOME", home);
    vi.stubEnv("OPENCLAW_PROFILE", "lab");
    vi.stubEnv("OPENCLAW_STATE_DIR", path.join(home, ".openclaw-lab"));

    expect(resolveDefaultAgentWorkspaceDir()).toBe(
      path.join(path.resolve(home), ".openclaw-lab", "workspace"),
    );
  });
});
