import { afterEach, describe, expect, it, vi } from "vitest";

const replacementRace = vi.hoisted(() => ({
  armed: false,
  triggered: false,
  tokenPath: "",
  replacementPath: "",
}));

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  const actualReadSync = actual.readSync as unknown as (...args: unknown[]) => number;
  return {
    ...actual,
    readSync: (...args: unknown[]) => {
      const count = actualReadSync(...args);
      if (replacementRace.armed && !replacementRace.triggered && count > 0) {
        replacementRace.triggered = true;
        actual.renameSync(replacementRace.replacementPath, replacementRace.tokenPath);
      }
      return count;
    },
  };
});

import {
  chmodSync,
  linkSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readDelegatedGithubToken } from "../scripts/lib/delegated-github-token.mjs";

const temporaryDirectories: string[] = [];

afterEach(() => {
  replacementRace.armed = false;
  replacementRace.triggered = false;
  replacementRace.tokenPath = "";
  replacementRace.replacementPath = "";
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("delegated GitHub token pathname identity", () => {
  it.skipIf(process.platform === "win32")(
    "rejects a token when the capability pathname is atomically replaced during the bounded read",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "noema-token-replacement-"));
      temporaryDirectories.push(directory);
      const tokenPath = join(directory, "token");
      const replacementPath = join(directory, "replacement");
      writeFileSync(tokenPath, "original-token", { encoding: "utf8", mode: 0o600 });
      writeFileSync(replacementPath, "replacement-token", { encoding: "utf8", mode: 0o600 });
      chmodSync(tokenPath, 0o600);
      chmodSync(replacementPath, 0o600);

      replacementRace.tokenPath = tokenPath;
      replacementRace.replacementPath = replacementPath;
      replacementRace.armed = true;

      expect(() => readDelegatedGithubToken(tokenPath)).toThrow(
        "Maintainer token file changed during the bounded read.",
      );
      expect(replacementRace.triggered).toBe(true);
    },
  );

  it.skipIf(process.platform === "win32")(
    "rejects a delegated token capability that has a second hard-link pathname",
    () => {
      const directory = mkdtempSync(join(tmpdir(), "noema-token-hardlink-"));
      temporaryDirectories.push(directory);
      const tokenPath = join(directory, "token");
      const aliasPath = join(directory, "token-alias");
      writeFileSync(tokenPath, "original-token", { encoding: "utf8", mode: 0o600 });
      chmodSync(tokenPath, 0o600);
      linkSync(tokenPath, aliasPath);

      expect(() => readDelegatedGithubToken(tokenPath)).toThrow(
        "Maintainer token capability must have exactly one hard link.",
      );
    },
  );
});
