import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MAX_REPORT_BYTES,
  isBoundedRegularEvidence,
  main,
  normalizeCommercialReadinessEvidence,
  readBoundedReport,
  resolveReportPath,
  runAsCommand,
  writeAtomically,
} from "../scripts/normalize-commercial-readiness-evidence.mjs";

const repository = "ContextualWisdomLab/noema";
const fixedNow = new Date("2026-08-04T11:15:00.000Z");
const originalReportPath = process.env.REPORT_PATH;
const originalExitCode = process.exitCode;
const temporaryDirectories: string[] = [];

function validReport() {
  return {
    schemaVersion: 1,
    repository,
    generatedAt: "2026-08-04T11:14:00.000Z",
    apply: false,
    openPullRequestCount: 1,
    remainingOpenPullRequestCount: 1,
    results: [
      {
        number: 62,
        headSha: "a".repeat(40),
        decision: "blocked",
        result: "blocked",
        reasons: [
          {
            code: "noema_current_head_approval_missing",
            detail: "No current-head Noema approval exists.",
          },
        ],
      },
    ],
  };
}

function normalize(value: unknown) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  return normalizeCommercialReadinessEvidence(Buffer.from(raw), {
    expectedRepository: repository,
    now: () => fixedNow,
  });
}

function expectInvalid(value: unknown) {
  const result = normalize(value);

  expect(result.valid).toBe(false);
  expect(result.report.results[0].reasons[0].code).toBe("dry_run_report_invalid");
  return result;
}

function createTemporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "noema-evidence-"));
  temporaryDirectories.push(directory);
  return directory;
}

function metadata({
  file = true,
  symlink = false,
  size = 4,
  dev = 1,
  ino = 2,
}: {
  file?: boolean;
  symlink?: boolean;
  size?: number;
  dev?: number;
  ino?: number;
} = {}) {
  return {
    dev,
    ino,
    size,
    isFile: () => file,
    isSymbolicLink: () => symlink,
  };
}

function readerAdapter({
  pathMetadata = metadata(),
  openedMetadata = pathMetadata,
  raw = Buffer.from("test") as unknown,
  constants = { O_NOFOLLOW: 1, O_RDONLY: 2 } as Record<string, number>,
  fstatError,
}: {
  pathMetadata?: ReturnType<typeof metadata>;
  openedMetadata?: ReturnType<typeof metadata>;
  raw?: unknown;
  constants?: Record<string, number>;
  fstatError?: Error;
} = {}) {
  const closed: number[] = [];
  return {
    closed,
    adapter: {
      constants,
      lstatSync: () => pathMetadata,
      openSync: () => 7,
      fstatSync: () => {
        if (fstatError) {
          throw fstatError;
        }
        return openedMetadata;
      },
      readFileSync: () => raw,
      closeSync: (descriptor: number) => closed.push(descriptor),
    },
  };
}

const invalidCases: Array<[string, unknown]> = [
  ["malformed JSON", "{not-json"],
  ["null root", "null"],
  ["string root", '"text"'],
  ["array root", "[]"],
  ["wrong schema version", { ...validReport(), schemaVersion: 2 }],
  ["wrong repository", { ...validReport(), repository: "outside/repository" }],
  ["write-enabled report", { ...validReport(), apply: true }],
  ["non-string timestamp", { ...validReport(), generatedAt: 7 }],
  ["empty timestamp", { ...validReport(), generatedAt: "" }],
  ["overlong timestamp", { ...validReport(), generatedAt: "x".repeat(65) }],
  [
    "timestamp control character",
    { ...validReport(), generatedAt: "2026-08-04T11:14:00.000Z\u0000" },
  ],
  [
    "noncanonical timestamp",
    { ...validReport(), generatedAt: "August 4, 2026 11:14:00 UTC" },
  ],
  [
    "unparseable canonical timestamp",
    { ...validReport(), generatedAt: "2026-13-04T11:14:00.000Z" },
  ],
  [
    "normalized timestamp mismatch",
    { ...validReport(), generatedAt: "2026-02-30T11:14:00.000Z" },
  ],
  ["non-array results", { ...validReport(), results: null }],
  [
    "too many results",
    {
      ...validReport(),
      results: Array.from({ length: 1_001 }, () => ({
        number: null,
        result: "blocked",
        reasons: [],
      })),
    },
  ],
  ["noninteger pull-request count", { ...validReport(), openPullRequestCount: 1.5 }],
  ["negative pull-request count", { ...validReport(), openPullRequestCount: -1 }],
  [
    "unsafe pull-request count",
    { ...validReport(), remainingOpenPullRequestCount: Number.MAX_SAFE_INTEGER + 1 },
  ],
  ["nonobject result", { ...validReport(), results: [null] }],
  [
    "noninteger result number",
    { ...validReport(), results: [{ number: 1.5, result: "blocked", reasons: [] }] },
  ],
  [
    "nonpositive result number",
    { ...validReport(), results: [{ number: 0, result: "blocked", reasons: [] }] },
  ],
  [
    "non-string result name",
    { ...validReport(), results: [{ number: 1, result: 7, reasons: [] }] },
  ],
  [
    "empty result name",
    { ...validReport(), results: [{ number: 1, result: "", reasons: [] }] },
  ],
  [
    "overlong result name",
    {
      ...validReport(),
      results: [{ number: 1, result: "x".repeat(101), reasons: [] }],
    },
  ],
  [
    "result-name control character",
    { ...validReport(), results: [{ number: 1, result: "blocked\u0000", reasons: [] }] },
  ],
  [
    "unsupported result name",
    { ...validReport(), results: [{ number: 1, result: "unknown", reasons: [] }] },
  ],
  [
    "non-array reasons",
    { ...validReport(), results: [{ number: 1, result: "blocked", reasons: null }] },
  ],
  [
    "too many reasons",
    {
      ...validReport(),
      results: [
        {
          number: 1,
          result: "blocked",
          reasons: Array.from({ length: 101 }, () => ({ code: "a", detail: "b" })),
        },
      ],
    },
  ],
  [
    "non-string head SHA",
    { ...validReport(), results: [{ number: 1, result: "blocked", headSha: 7, reasons: [] }] },
  ],
  [
    "overlong head SHA",
    {
      ...validReport(),
      results: [
        { number: 1, result: "blocked", headSha: "a".repeat(41), reasons: [] },
      ],
    },
  ],
  [
    "nonhexadecimal head SHA",
    {
      ...validReport(),
      results: [
        { number: 1, result: "blocked", headSha: "z".repeat(40), reasons: [] },
      ],
    },
  ],
  [
    "non-string decision",
    { ...validReport(), results: [{ number: 1, result: "blocked", decision: 7, reasons: [] }] },
  ],
  [
    "unsupported decision",
    {
      ...validReport(),
      results: [
        { number: 1, result: "blocked", decision: "unknown", reasons: [] },
      ],
    },
  ],
  [
    "nonobject reason",
    { ...validReport(), results: [{ number: 1, result: "blocked", reasons: [null] }] },
  ],
  [
    "non-string reason code",
    {
      ...validReport(),
      results: [
        { number: 1, result: "blocked", reasons: [{ code: 7, detail: "b" }] },
      ],
    },
  ],
  [
    "invalid reason code",
    {
      ...validReport(),
      results: [
        {
          number: 1,
          result: "blocked",
          reasons: [{ code: "Not Snake Case", detail: "b" }],
        },
      ],
    },
  ],
  [
    "non-string reason detail",
    {
      ...validReport(),
      results: [
        { number: 1, result: "blocked", reasons: [{ code: "a", detail: 7 }] },
      ],
    },
  ],
  [
    "reason-detail control character",
    {
      ...validReport(),
      results: [
        {
          number: 1,
          result: "blocked",
          reasons: [{ code: "a", detail: "unsafe\u0000detail" }],
        },
      ],
    },
  ],
  [
    "non-string result detail",
    { ...validReport(), results: [{ number: 1, result: "blocked", reasons: [], detail: 7 }] },
  ],
  [
    "overlong result detail",
    {
      ...validReport(),
      results: [
        { number: 1, result: "blocked", reasons: [], detail: "x".repeat(1_001) },
      ],
    },
  ],
];

afterEach(() => {
  vi.restoreAllMocks();
  if (originalReportPath === undefined) {
    delete process.env.REPORT_PATH;
  } else {
    process.env.REPORT_PATH = originalReportPath;
  }
  process.exitCode = originalExitCode;
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true });
  }
});

describe("commercial-readiness evidence schema", () => {
  it("canonicalizes a realistic no-write pull-request report", () => {
    const report = validReport();
    const result = normalize({ ...report, ignoredField: "not retained" });

    expect(result.valid).toBe(true);
    expect(result.report).toEqual(report);
    expect(result.content).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(Buffer.byteLength(result.content)).toBeLessThanOrEqual(MAX_REPORT_BYTES);
  });

  it("uses documented defaults for invalid non-buffer evidence", () => {
    const result = normalizeCommercialReadinessEvidence(null);

    expect(result.valid).toBe(false);
    expect(result.report.repository).toBe(repository);
    expect(result.report.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("rejects empty and oversized buffers before parsing", () => {
    expect(normalizeCommercialReadinessEvidence(Buffer.alloc(0)).valid).toBe(false);
    expect(
      normalizeCommercialReadinessEvidence(Buffer.alloc(MAX_REPORT_BYTES + 1)).valid,
    ).toBe(false);
  });

  it.each(invalidCases)("replaces %s with fixed fail-closed evidence", (_label, input) => {
    const result = expectInvalid(input);

    expect(result.report).toEqual({
      schemaVersion: 1,
      repository,
      generatedAt: fixedNow.toISOString(),
      apply: false,
      openPullRequestCount: null,
      remainingOpenPullRequestCount: null,
      results: [
        {
          number: null,
          result: "operational_error",
          reasons: [
            {
              code: "dry_run_report_invalid",
              detail:
                "Dry-run evidence failed size, syntax, or schema validation and was replaced before artifact upload.",
            },
          ],
        },
      ],
    });
    expect(result.content).not.toContain("not-json");
    expect(result.content).not.toContain("unsafe");
  });

  it("accepts unknown counts while preserving a canonical head SHA", () => {
    const report: any = validReport();
    report.openPullRequestCount = null;
    report.remainingOpenPullRequestCount = null;
    report.results = [
      {
        number: null,
        headSha: "a".repeat(40),
        result: "merge",
        reasons: [],
      },
    ];

    const result = normalize(report);

    expect(result.valid).toBe(true);
    expect(result.report.results[0].headSha).toBe("a".repeat(40));
  });

  it("retains every supported operational result and decision", () => {
    const report: any = validReport();
    report.results = [
      ["blocked", "blocked"],
      ["request_review", "request_review"],
      ["merge", "merge"],
      ["review_in_progress"],
      ["review_dispatched"],
      ["merged"],
      ["operational_error"],
    ].map(([result, decision], index) => ({
      number: index + 1,
      result,
      reasons: [],
      ...(decision ? { decision } : {}),
      ...(result === "merged" ? { detail: "Squash-merged at a reviewed commit." } : {}),
    }));

    const normalized = normalize(report);

    expect(normalized.valid).toBe(true);
    expect(normalized.report).toEqual(report);
  });

  it("replaces evidence whose canonical representation exceeds one mebibyte", () => {
    const report: any = validReport();
    const reason = { code: "a", detail: "b" };
    report.results = Array.from({ length: 1_000 }, (_, index) => ({
      number: index + 1,
      result: "blocked",
      reasons: Array.from({ length: 20 }, () => reason),
    }));
    const raw = Buffer.from(JSON.stringify(report));

    expect(raw.byteLength).toBeLessThan(MAX_REPORT_BYTES);
    const result = normalizeCommercialReadinessEvidence(raw, {
      expectedRepository: repository,
      now: () => fixedNow,
    });

    expect(result.valid).toBe(false);
    expect(result.report.results[0].reasons[0].code).toBe("dry_run_report_invalid");
  });
});

describe("commercial-readiness evidence filesystem boundary", () => {
  it.each([
    ["missing metadata", null],
    ["missing symlink predicate", { isFile: () => true, size: 4 }],
    ["missing file predicate", { isSymbolicLink: () => false, size: 4 }],
    ["symlink", metadata({ symlink: true })],
    ["directory", metadata({ file: false })],
    ["unsafe size", metadata({ size: Number.MAX_SAFE_INTEGER + 1 })],
    ["empty file", metadata({ size: 0 })],
    ["oversized file", metadata({ size: MAX_REPORT_BYTES + 1 })],
  ])("rejects %s", (_label, value) => {
    expect(isBoundedRegularEvidence(value)).toBe(false);
  });

  it("accepts bounded regular metadata", () => {
    expect(isBoundedRegularEvidence(metadata())).toBe(true);
  });

  it("reads a stable no-follow descriptor and always closes it", () => {
    const { adapter, closed } = readerAdapter();

    expect(readBoundedReport("report.json", adapter)).toEqual(Buffer.from("test"));
    expect(closed).toEqual([7]);
  });

  it.each([
    ["unsafe path metadata", { pathMetadata: metadata({ symlink: true }) }],
    ["missing no-follow flag", { constants: { O_RDONLY: 2 } }],
    ["missing read-only flag", { constants: { O_NOFOLLOW: 1 } }],
    ["unsafe descriptor metadata", { openedMetadata: metadata({ file: false }) }],
    ["device swap", { openedMetadata: metadata({ dev: 9 }) }],
    ["inode swap", { openedMetadata: metadata({ ino: 9 }) }],
    ["size swap", { openedMetadata: metadata({ size: 3 }) }],
    ["non-buffer read", { raw: "test" }],
    ["short read", { raw: Buffer.from("bad") }],
  ])("fails closed on %s", (_label, options) => {
    const { adapter } = readerAdapter(options);

    expect(readBoundedReport("report.json", adapter)).toBeNull();
  });

  it("closes the descriptor when descriptor inspection throws", () => {
    const { adapter, closed } = readerAdapter({
      fstatError: new Error("fstat failed"),
    });

    expect(() => readBoundedReport("report.json", adapter)).toThrow("fstat failed");
    expect(closed).toEqual([7]);
  });

  it("reads a real regular report through the production no-follow adapter", () => {
    const directory = createTemporaryDirectory();
    const reportPath = join(directory, "report.json");
    writeFileSync(reportPath, "test", "utf8");

    expect(readBoundedReport(reportPath)).toEqual(Buffer.from("test"));
  });

  it("atomically writes mode-0600 evidence and removes its private temporary directory", () => {
    const directory = createTemporaryDirectory();
    const reportPath = join(directory, "report.json");

    writeAtomically(reportPath, "evidence\n");

    expect(readFileSync(reportPath, "utf8")).toBe("evidence\n");
    expect(statSync(reportPath).mode & 0o777).toBe(0o600);
    expect(readdirSync(directory)).toEqual(["report.json"]);
  });

  it("rolls back its private temporary directory when replacement fails", () => {
    const directory = createTemporaryDirectory();
    const reportPath = join(directory, "existing-directory");
    mkdirSync(reportPath);
    writeFileSync(join(reportPath, "keep.txt"), "keep", "utf8");

    expect(() => writeAtomically(reportPath, "replacement\n")).toThrow();

    expect(readdirSync(directory)).toEqual(["existing-directory"]);
    expect(readFileSync(join(reportPath, "keep.txt"), "utf8")).toBe("keep");
  });

  it("does not follow a predictable temporary-file symlink while replacing evidence", () => {
    const directory = createTemporaryDirectory();
    const reportPath = join(directory, "commercial-readiness.json");
    const protectedPath = join(directory, "protected.txt");
    const predictableTemporaryPath = `${reportPath}.${process.pid}.tmp`;
    writeFileSync(reportPath, `${JSON.stringify(validReport())}\n`, "utf8");
    writeFileSync(protectedPath, "protected-sentinel\n", "utf8");
    symlinkSync(protectedPath, predictableTemporaryPath);
    process.env.REPORT_PATH = reportPath;
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = main({ now: () => fixedNow });

    expect(result.valid).toBe(true);
    expect(readFileSync(protectedPath, "utf8")).toBe("protected-sentinel\n");
    expect(lstatSync(reportPath).isFile()).toBe(true);
    expect(lstatSync(reportPath).isSymbolicLink()).toBe(false);
  });

  it("does not follow a report symlink while retaining canonical failure evidence", () => {
    const directory = createTemporaryDirectory();
    const reportPath = join(directory, "report.json");
    const protectedPath = join(directory, "protected.txt");
    writeFileSync(protectedPath, "protected-sentinel\n", "utf8");
    symlinkSync(protectedPath, reportPath);
    const exitCodes: number[] = [];

    const result = main({
      reportPath,
      now: () => fixedNow,
      log: () => undefined,
      setExitCode: (code: number) => exitCodes.push(code),
    });

    expect(result.valid).toBe(false);
    expect(readFileSync(protectedPath, "utf8")).toBe("protected-sentinel\n");
    expect(lstatSync(reportPath).isFile()).toBe(true);
    expect(exitCodes).toEqual([1]);
  });
});

describe("commercial-readiness evidence command boundary", () => {
  it("resolves explicit, missing, and blank report paths", () => {
    const currentDirectory = "/tmp/noema-current-directory";

    expect(resolveReportPath("custom/report.json", currentDirectory)).toBe(
      resolve(currentDirectory, "custom/report.json"),
    );
    expect(resolveReportPath(undefined, currentDirectory)).toBe(
      resolve(
        currentDirectory,
        "artifacts/operations/commercial-readiness-loop-dry-run.json",
      ),
    );
    expect(resolveReportPath("   ", currentDirectory)).toBe(
      resolve(
        currentDirectory,
        "artifacts/operations/commercial-readiness-loop-dry-run.json",
      ),
    );
  });

  it("normalizes a valid report through the production main defaults", () => {
    const directory = createTemporaryDirectory();
    const reportPath = join(directory, "report.json");
    writeFileSync(reportPath, `${JSON.stringify(validReport())}\n`, "utf8");
    process.env.REPORT_PATH = reportPath;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = main({ now: () => fixedNow });

    expect(result.valid).toBe(true);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("retains canonical failure evidence when reading throws", () => {
    const writes: unknown[][] = [];
    const logs: string[] = [];
    const exitCodes: number[] = [];

    const result = main({
      reportPath: "/bounded/report.json",
      now: () => fixedNow,
      readReport: () => {
        throw new Error("read failed");
      },
      writeReport: (...arguments_: unknown[]) => writes.push(arguments_),
      log: (message: string) => logs.push(message),
      setExitCode: (code: number) => exitCodes.push(code),
    });

    expect(result.valid).toBe(false);
    expect(writes).toHaveLength(1);
    expect(logs).toHaveLength(1);
    expect(exitCodes).toEqual([1]);
  });

  it("uses production defaults for a missing report", () => {
    const directory = createTemporaryDirectory();
    const reportPath = join(directory, "missing-report.json");
    process.env.REPORT_PATH = reportPath;
    process.exitCode = 0;
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const result = main();

    expect(result.valid).toBe(false);
    expect(process.exitCode).toBe(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(reportPath, "utf8")).results[0].reasons[0].code).toBe(
      "dry_run_report_invalid",
    );
  });

  it("does not run without an entry path or for an imported module", () => {
    const execute = vi.fn();

    expect(
      runAsCommand({ argvPath: "", moduleUrl: "file:///module.mjs", execute }),
    ).toBe(false);
    expect(
      runAsCommand({
        argvPath: "/different.mjs",
        moduleUrl: "file:///module.mjs",
        execute,
      }),
    ).toBe(false);
    expect(execute).not.toHaveBeenCalled();
  });

  it("runs exactly once when the module URL matches the entry path", () => {
    const entryPath = "/tmp/noema-command.mjs";
    const execute = vi.fn();

    expect(
      runAsCommand({
        argvPath: entryPath,
        moduleUrl: pathToFileURL(resolve(entryPath)).href,
        execute,
      }),
    ).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
