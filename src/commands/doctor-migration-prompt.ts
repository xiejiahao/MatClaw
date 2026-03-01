import { confirm as clackConfirm } from "@clack/prompts";
import { formatCliCommand } from "../cli/command-format.js";
import type { RuntimeEnv } from "../runtime.js";
import { note } from "../terminal/note.js";
import { guardCancel } from "./onboard-helpers.js";

export type DoctorMigrationSpec<T extends { canMigrate: boolean; blockedReason?: string }> = {
  migration: T;
  title: string;
  formatPreview: (m: T) => string;
  confirmMessage: string;
  runMigration: (m: T) => Promise<string[]>;
  formatBlockedHint: (m: T) => string;
};

export async function runDoctorMigrationPrompt<
  T extends { canMigrate: boolean; blockedReason?: string },
>(
  spec: DoctorMigrationSpec<T>,
  params: {
    runtime: RuntimeEnv;
    nonInteractive?: boolean;
    yes?: boolean;
  },
): Promise<void> {
  note(spec.formatPreview(spec.migration), spec.title);

  if (spec.migration.canMigrate) {
    const canPrompt =
      params.nonInteractive !== true && params.yes !== true && Boolean(process.stdin.isTTY);

    if (canPrompt) {
      const approved = guardCancel(
        await clackConfirm({
          message: spec.confirmMessage,
          initialValue: true,
        }),
        params.runtime,
      );
      if (approved) {
        const resultLines = await spec.runMigration(spec.migration);
        note(resultLines.join("\n"), "Doctor changes");
      }
    } else {
      note(
        [
          "Migration is safe but requires interactive confirmation before moving files.",
          `Run interactively: ${formatCliCommand("openclaw doctor")}`,
        ].join("\n"),
        spec.title,
      );
    }
  } else if (spec.migration.blockedReason) {
    note(
      [spec.migration.blockedReason, spec.formatBlockedHint(spec.migration)].join("\n"),
      spec.title,
    );
  }
}
