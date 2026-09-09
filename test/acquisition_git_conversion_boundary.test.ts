import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "vitest";
import {
  resolveAcquisitionCommit,
  verifyAcquisitionTrackedCheckout,
} from "../scripts/lib/acquisition-git-preflight.mjs";

function fixtureGit(repositoryRoot: string, commandArguments: string[]) {
  const commandResult = spawnSync("git", commandArguments, {
    cwd: repositoryRoot,
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null",
      GIT_TERMINAL_PROMPT: "0",
    },
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.ifError(commandResult.error);
  assert.equal(commandResult.signal, null);
  assert.equal(commandResult.status, 0, commandResult.stderr);
  return commandResult.stdout.trim();
}

function withRepository(runAssertion: (repositoryRoot: string) => void) {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "noema-conversion-boundary-"));
  try {
    fixtureGit(repositoryRoot, ["init", "--quiet"]);
    writeFileSync(join(repositoryRoot, "tracked.txt"), "base\n");
    writeFileSync(join(repositoryRoot, ".gitattributes"), "tracked.txt -filter\n");
    fixtureGit(repositoryRoot, ["add", "tracked.txt", ".gitattributes"]);
    fixtureGit(repositoryRoot, [
      "-c", "user.name=Noema Tests", "-c", "user.email=noema-tests@example.invalid",
      "commit", "--quiet", "-m", "isolated conversion fixture",
    ]);
    runAssertion(repositoryRoot);
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
}

describe("acquisition read-only conversion boundary", () => {
  for (const attributeSource of ["worktree_attributes", "info_attributes"]) {
    for (const filterKind of ["clean", "process"]) {
      for (const inputBytes of ["base\n", "evil\n"]) {
        it(`never launches ${filterKind} from ${attributeSource} for ${inputBytes === "base\n" ? "unchanged" : "same-size changed"} bytes`, () => {
          withRepository((repositoryRoot) => {
            const trackedPath = join(repositoryRoot, "tracked.txt");
            if (attributeSource === "worktree_attributes") {
              writeFileSync(join(repositoryRoot, ".gitattributes"), "tracked.txt filter=marker_only\n");
              fixtureGit(repositoryRoot, ["add", ".gitattributes"]);
              fixtureGit(repositoryRoot, [
                "-c", "user.name=Noema Tests", "-c", "user.email=noema-tests@example.invalid",
                "commit", "--quiet", "-m", "declare inert filter name",
              ]);
            } else {
              writeFileSync(join(repositoryRoot, ".git", "info", "attributes"), "tracked.txt filter=marker_only\n");
            }
            const markerPath = join(repositoryRoot, ".git", "conversion_marker");
            const helperPath = join(repositoryRoot, ".git", "marker_helper.mjs");
            writeFileSync(helperPath,
              `import { writeFileSync } from "node:fs";\nwriteFileSync(${JSON.stringify(markerPath)}, "observed");\n`
              + (filterKind === "clean" ? 'process.stdout.write("base\\n");\n' : "process.exitCode = 1;\n"));
            fixtureGit(repositoryRoot, ["config", `filter.marker_only.${filterKind}`, `"${process.execPath}" "${helperPath}"`]);
            fixtureGit(repositoryRoot, ["config", "filter.marker_only.required", "true"]);
            const exactHead = resolveAcquisitionCommit("HEAD", { cwd: repositoryRoot });
            const originalConfiguration = readFileSync(join(repositoryRoot, ".git", "config"));
            writeFileSync(trackedPath, inputBytes);
            let actualHead;
            let verificationError;
            try {
              actualHead = verifyAcquisitionTrackedCheckout({ cwd: repositoryRoot, expectedCommitSha: exactHead });
            } catch (error) {
              verificationError = error;
            }
            assert.equal(existsSync(markerPath), false, "a read-only preflight launched a repository conversion helper");
            assert.deepEqual(readFileSync(join(repositoryRoot, ".git", "config")), originalConfiguration);
            if (inputBytes === "base\n") {
              assert.ifError(verificationError);
              assert.equal(actualHead, exactHead);
            } else {
              assert.ok(verificationError instanceof Error);
              assert.match(verificationError.message, /tracked checkout differs/);
            }
          });
        });
      }
    }
  }

  it("continues to reject different-size drift without needing a Git filter", () => {
    withRepository((repositoryRoot) => {
      writeFileSync(join(repositoryRoot, "tracked.txt"), "longer changed bytes\n");
      assert.throws(() => verifyAcquisitionTrackedCheckout({ cwd: repositoryRoot }), /tracked checkout differs/);
    });
  });

  it("retains index-versus-HEAD authentication for staged changes", () => {
    withRepository((repositoryRoot) => {
      writeFileSync(join(repositoryRoot, "tracked.txt"), "staged bytes\n");
      fixtureGit(repositoryRoot, ["add", "tracked.txt"]);
      assert.throws(() => verifyAcquisitionTrackedCheckout({ cwd: repositoryRoot }), /tracked checkout differs from exact HEAD/);
    });
  });

  for (const unsafeFlag of ["--assume-unchanged", "--skip-worktree"]) {
    it(`rejects the ${unsafeFlag} index shortcut`, () => {
      withRepository((repositoryRoot) => {
        fixtureGit(repositoryRoot, ["update-index", unsafeFlag, "tracked.txt"]);
        assert.throws(() => verifyAcquisitionTrackedCheckout({ cwd: repositoryRoot }), /unsafe Git index flag/);
      });
    });
  }

  it("permits retained untracked evidence without extending tracked source authority", () => {
    withRepository((repositoryRoot) => {
      const exactHead = resolveAcquisitionCommit("HEAD", { cwd: repositoryRoot });
      writeFileSync(join(repositoryRoot, "retained_evidence.json"), "{}\n");
      assert.equal(verifyAcquisitionTrackedCheckout({ cwd: repositoryRoot }), exactHead);
    });
  });
});
