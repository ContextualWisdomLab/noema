import { spawnSync } from "node:child_process";
import {
  chmodSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseAgentPrMessage } from "../scripts/prepare-agent-pr-message.mjs";

const temporaryDirectories: string[] = [];
const encoder = new TextEncoder();

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-agent-pr-message-"));
  temporaryDirectories.push(directory);
  return directory;
}

function parse(text: string, limits = { maxTitleBytes: 120, maxBodyBytes: 20_000 }) {
  return parseAgentPrMessage(encoder.encode(text), limits);
}

describe("model-generated pull-request metadata", () => {
  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("normalizes a realistic Markdown message with Unicode and CRLF", () => {
    expect(parse(
      "# feat(operations): harden buyer evidence ✅\r\n\r\n"
        + "## Summary\r\n- Binds evidence to the exact release.\r\n",
    )).toEqual({
      title: "feat(operations): harden buyer evidence ✅",
      body: "## Summary\n- Binds evidence to the exact release.",
    });
  });

  it("rejects an empty title after removing a Markdown heading", () => {
    expect(() => parse("###   \nBody without a title")).toThrow(
      "PR title is empty or exceeds the byte budget",
    );
  });

  it("enforces the title budget in UTF-8 bytes rather than JavaScript characters", () => {
    expect(() => parse(`${"가".repeat(41)}\nBody`)).toThrow(
      "PR title is empty or exceeds the byte budget",
    );
  });

  it("rejects a body that exceeds its UTF-8 byte budget", () => {
    expect(() => parse(`feat: bounded title\n${"a".repeat(20_001)}`)).toThrow(
      "PR body exceeds the byte budget",
    );
  });

  it.each([
    "feat: bell\u0007 injection\nBody",
    "feat: valid title\nBody with null\u0000 injection",
    "feat: valid title\nBody with escape\u001b injection",
  ])("rejects unsupported control characters in %j", (message) => {
    expect(() => parse(message)).toThrow(
      "PR metadata contains unsupported control characters",
    );
  });

  it("rejects malformed UTF-8 instead of replacing invalid bytes", () => {
    expect(() => parseAgentPrMessage(
      new Uint8Array([0xc3, 0x28]),
      { maxTitleBytes: 120, maxBodyBytes: 20_000 },
    )).toThrow("PR_MESSAGE.md must be valid UTF-8");
  });

  it("writes bounded metadata files with owner-only permissions", () => {
    const directory = temporaryDirectory();
    const source = join(directory, "PR_MESSAGE.md");
    const titlePath = join(directory, "pr-title.txt");
    const bodyPath = join(directory, "pr-body.md");
    writeFileSync(source, "feat: safe metadata\n\nVerified body\n", { mode: 0o600 });

    const result = spawnSync(
      process.execPath,
      ["scripts/prepare-agent-pr-message.mjs", source, titlePath, bodyPath],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MAX_PR_TITLE_BYTES: "120",
          MAX_PR_BODY_BYTES: "20000",
        },
        encoding: "utf8",
      },
    );

    expect(result.status).toBe(0);
    expect(readFileSync(titlePath, "utf8")).toBe("feat: safe metadata");
    expect(readFileSync(bodyPath, "utf8")).toBe("Verified body");
    expect(statSync(titlePath).mode & 0o777).toBe(0o600);
    expect(statSync(bodyPath).mode & 0o777).toBe(0o600);
  });

  it("rejects a symlink before reading model-generated metadata", () => {
    const directory = temporaryDirectory();
    const target = join(directory, "target.md");
    const source = join(directory, "PR_MESSAGE.md");
    writeFileSync(target, "feat: unsafe indirection\nBody", { mode: 0o600 });
    symlinkSync(target, source);
    chmodSync(target, 0o600);

    const result = spawnSync(
      process.execPath,
      [
        "scripts/prepare-agent-pr-message.mjs",
        source,
        join(directory, "pr-title.txt"),
        join(directory, "pr-body.md"),
      ],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MAX_PR_TITLE_BYTES: "120",
          MAX_PR_BODY_BYTES: "20000",
        },
        encoding: "utf8",
      },
    );

    expect(lstatSync(source).isSymbolicLink()).toBe(true);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "PR_MESSAGE.md must be a regular non-symlink file",
    );
  });
});
