import { mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_SANDBOX_LIMITS,
  buildDockerCreateArgs,
  inventorySourceRoot,
  summarizeSandboxEvidence,
  validateSandboxEvidence,
} from "../scripts/lib/quarantine-sandbox.mjs";

function sourceFixture() {
  const root = mkdtempSync(join(tmpdir(), "noema-quarantine-"));
  mkdirSync(join(root, "src"));
  writeFileSync(join(root, "README.md"), "hello", "utf8");
  writeFileSync(join(root, "src", "index.js"), "export default 1;", "utf8");
  return root;
}

function passingEvidence() {
  return {
    schema_version: 1,
    status: "pass",
    image_id: `sha256:${"a".repeat(64)}`,
    source_read_only: true,
    root_filesystem_read_only: true,
    network_disabled: true,
    sensitive_environment_absent: true,
    input_file_count: 2,
    input_total_bytes: 22,
    input_max_file_bytes: 17,
    input_max_relative_path_bytes: 12,
    limits: {
      cpu_count: DEFAULT_SANDBOX_LIMITS.cpuCount,
      memory_bytes: DEFAULT_SANDBOX_LIMITS.memoryBytes,
      pids: DEFAULT_SANDBOX_LIMITS.pids,
      wall_clock_seconds: DEFAULT_SANDBOX_LIMITS.wallClockSeconds,
      output_bytes: DEFAULT_SANDBOX_LIMITS.outputBytes,
    },
  };
}

describe("quarantine source inventory", () => {
  it("records regular-file and byte bounds without reading file contents", () => {
    const inventory = inventorySourceRoot(sourceFixture());

    expect(inventory).toEqual({
      fileCount: 2,
      totalBytes: 22,
      maxFileBytes: 17,
      maxRelativePathBytes: 12,
    });
  });

  it("rejects symlinks instead of following them", () => {
    const root = sourceFixture();
    symlinkSync(join(root, "README.md"), join(root, "linked-readme"));

    expect(() => inventorySourceRoot(root)).toThrow(/symlink/i);
  });

  it("rejects an input that exceeds a configured file-count limit", () => {
    const root = sourceFixture();

    expect(() =>
      inventorySourceRoot(root, {
        ...DEFAULT_SANDBOX_LIMITS,
        maxFileCount: 1,
      }),
    ).toThrow(/file count/i);
  });
});

describe("Docker quarantine policy", () => {
  it("builds a non-root, networkless, read-only, quota-bound container", () => {
    const args = buildDockerCreateArgs({
      containerName: "noema-quarantine-test",
      sourceRoot: "/tmp/source",
      analyzerPath: "/tmp/analyzer.sh",
      imageId: `sha256:${"a".repeat(64)}`,
      inventory: {
        fileCount: 2,
        totalBytes: 22,
        maxFileBytes: 17,
        maxRelativePathBytes: 12,
      },
    });
    const rendered = args.join(" ");

    expect(args[0]).toBe("create");
    expect(rendered).toContain("--network none");
    expect(rendered).toContain("--read-only");
    expect(rendered).toContain("--cap-drop ALL");
    expect(rendered).toContain("--security-opt no-new-privileges=true");
    expect(rendered).toContain("--pids-limit 64");
    expect(rendered).toContain("--memory 536870912");
    expect(rendered).toContain("--memory-swap 536870912");
    expect(rendered).toContain("--cpus 1");
    expect(rendered).toContain("--user 65532:65532");
    expect(rendered).toContain("dst=/workspace/source,readonly");
    expect(rendered).toContain("dst=/sandbox/analyzer.sh,readonly");
    expect(rendered).toContain("/tmp:rw,noexec,nosuid,nodev,size=67108864");
    expect(rendered).toContain("/output:rw,noexec,nosuid,nodev,size=8388608");
    expect(rendered).not.toContain("--privileged");
    expect(rendered).not.toContain("docker.sock");
  });
});

describe("quarantine evidence validation", () => {
  it("accepts evidence bound to the image, input inventory, and quotas", () => {
    const evidence = passingEvidence();

    expect(
      validateSandboxEvidence(evidence, {
        imageId: evidence.image_id,
        inventory: {
          fileCount: 2,
          totalBytes: 22,
          maxFileBytes: 17,
          maxRelativePathBytes: 12,
        },
      }),
    ).toEqual(evidence);
    expect(summarizeSandboxEvidence(evidence)).toContain("passed:");
    expect(summarizeSandboxEvidence(evidence)).toContain(evidence.image_id);
  });

  it.each([
    ["source_read_only", false],
    ["root_filesystem_read_only", false],
    ["network_disabled", false],
    ["sensitive_environment_absent", false],
    ["status", "fail"],
  ])("rejects failed control %s", (field, value) => {
    const evidence = { ...passingEvidence(), [field]: value };

    expect(() =>
      validateSandboxEvidence(evidence, {
        imageId: passingEvidence().image_id,
        inventory: {
          fileCount: 2,
          totalBytes: 22,
          maxFileBytes: 17,
          maxRelativePathBytes: 12,
        },
      }),
    ).toThrow(/quarantine evidence/i);
  });

  it("rejects evidence from a different image or input tree", () => {
    const evidence = passingEvidence();

    expect(() =>
      validateSandboxEvidence(evidence, {
        imageId: `sha256:${"b".repeat(64)}`,
        inventory: {
          fileCount: 3,
          totalBytes: 22,
          maxFileBytes: 17,
          maxRelativePathBytes: 12,
        },
      }),
    ).toThrow(/image|inventory/i);
  });
});
