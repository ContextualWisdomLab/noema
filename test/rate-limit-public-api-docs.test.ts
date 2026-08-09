import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");
type TsNode = import("typescript").Node;
type TsSourceFile = import("typescript").SourceFile;
type TsStatement = import("typescript").Statement;
type TsExportDeclaration = import("typescript").ExportDeclaration;
type TsSyntaxKind = import("typescript").SyntaxKind;

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

function sourcePaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourcePaths(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    })
    .sort();
}

const parsedSources = sourcePaths(sourceRoot).map((path) => {
  const source = readFileSync(path, "utf8");
  return {
    path: relative(sourceRoot, path).replaceAll("\\", "/"),
    source,
    file: ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS),
  };
});

function jsdocImmediatelyBefore(source: string, node: TsNode): string | undefined {
  const prefix = source.slice(node.getFullStart(), node.getStart());
  return prefix.match(/(\/\*\*[\s\S]*?\*\/)\s*$/)?.[1];
}

function meaningfulJSDoc(doc: string | undefined): boolean {
  return Boolean(doc && doc.length > 80 && !/\b(?:TODO|TBD)\b/i.test(doc));
}

function hasModifier(node: TsNode, kind: TsSyntaxKind): boolean {
  return Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind));
}

function exported(node: TsNode): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

type DirectExport = {
  name: string;
  path: string;
  source: string;
  file: TsSourceFile;
  node: TsNode;
  callable: boolean;
  parameterCount: number;
};

type NamedReexport = {
  exposedName: string;
  originalName: string;
  path: string;
  source: string;
  node: TsExportDeclaration;
};

function declarationNames(statement: TsStatement): Array<{
  name: string;
  node: TsNode;
  callable: boolean;
  parameterCount: number;
}> {
  if (
    ts.isInterfaceDeclaration(statement)
    || ts.isTypeAliasDeclaration(statement)
    || ts.isClassDeclaration(statement)
    || ts.isEnumDeclaration(statement)
    || ts.isModuleDeclaration(statement)
  ) {
    return statement.name
      ? [{ name: statement.name.text, node: statement, callable: false, parameterCount: 0 }]
      : [];
  }

  if (ts.isFunctionDeclaration(statement)) {
    return statement.name
      ? [{
          name: statement.name.text,
          node: statement,
          callable: true,
          parameterCount: statement.parameters.length,
        }]
      : [];
  }

  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations.flatMap((declaration) =>
      ts.isIdentifier(declaration.name)
        ? [{ name: declaration.name.text, node: statement, callable: false, parameterCount: 0 }]
        : []
    );
  }

  return [];
}

const directExports: DirectExport[] = [];
const namedReexports: NamedReexport[] = [];

for (const parsed of parsedSources) {
  for (const statement of parsed.file.statements) {
    if (ts.isExportAssignment(statement)) {
      directExports.push({
        name: "default",
        path: parsed.path,
        source: parsed.source,
        file: parsed.file,
        node: statement,
        callable: false,
        parameterCount: 0,
      });
      continue;
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          namedReexports.push({
            exposedName: element.name.text,
            originalName: element.propertyName?.text ?? element.name.text,
            path: parsed.path,
            source: parsed.source,
            node: statement,
          });
        }
      }
      continue;
    }

    if (!exported(statement)) continue;
    for (const declaration of declarationNames(statement)) {
      directExports.push({
        ...declaration,
        path: parsed.path,
        source: parsed.source,
        file: parsed.file,
      });
    }
  }
}

function location(item: { path: string; file?: TsSourceFile; node: TsNode }): string {
  const file = item.file ?? parsedSources.find((candidate) => candidate.path === item.path)?.file;
  const line = file ? file.getLineAndCharacterOfPosition(item.node.getStart(file)).line + 1 : 0;
  return `${item.path}:${line}`;
}

function expectPublicDoc(source: string, marker: string, requiredTerms: string[]): void {
  const markerIndex = source.indexOf(marker);
  expect(markerIndex, `missing source marker: ${marker}`).toBeGreaterThanOrEqual(0);
  const prefix = source.slice(0, markerIndex);
  const commentStart = prefix.lastIndexOf("/**");
  expect(commentStart, `${marker} must have a preceding JSDoc block`).toBeGreaterThanOrEqual(0);
  const commentEnd = prefix.indexOf("*/", commentStart);
  expect(commentEnd, `${marker} JSDoc must be terminated`).toBeGreaterThan(commentStart);
  expect(
    prefix.slice(commentEnd + 2).trim(),
    `${marker} JSDoc must be immediately adjacent to the documented symbol`,
  ).toBe("");

  const doc = prefix.slice(commentStart, commentEnd + 2);
  expect(doc.length, `${marker} JSDoc must explain behavior rather than act as a label`).toBeGreaterThan(80);
  expect(doc).not.toMatch(/\b(?:TODO|TBD)\b/i);
  for (const term of requiredTerms) {
    expect(doc.toLowerCase(), `${marker} JSDoc must explain ${term}`).toContain(term.toLowerCase());
  }
}

describe("repository-wide TypeScript public API inventory", () => {
  it("discovers every owned production TypeScript module recursively", () => {
    expect(parsedSources.length).toBeGreaterThan(0);
    expect(parsedSources.map(({ path }) => path)).toEqual(
      [...parsedSources.map(({ path }) => path)].sort(),
    );
  });

  it("requires meaningful adjacent JSDoc for every direct public export", () => {
    const failures = directExports.flatMap((item) => {
      const doc = jsdocImmediatelyBefore(item.source, item.node);
      const reasons: string[] = [];
      if (!meaningfulJSDoc(doc)) reasons.push("missing or non-meaningful adjacent JSDoc");
      if (item.callable && item.parameterCount > 0 && !doc?.includes("@param")) {
        reasons.push("callable export does not document parameters");
      }
      if (item.callable && !doc?.includes("@returns")) {
        reasons.push("callable export does not document its return contract");
      }
      return reasons.map((reason) => `${location(item)} ${item.name}: ${reason}`);
    });

    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("allows named re-exports only when the original public symbol is documented unambiguously", () => {
    const documentedByName = new Map<string, DirectExport[]>();
    for (const item of directExports) {
      if (!meaningfulJSDoc(jsdocImmediatelyBefore(item.source, item.node))) continue;
      const values = documentedByName.get(item.name) ?? [];
      values.push(item);
      documentedByName.set(item.name, values);
    }

    const failures = namedReexports.flatMap((item) => {
      const candidates = documentedByName.get(item.originalName) ?? [];
      if (candidates.length === 1) return [];
      const localDoc = jsdocImmediatelyBefore(item.source, item.node);
      if (meaningfulJSDoc(localDoc)) return [];
      return [
        `${item.path} re-export ${item.exposedName} -> ${item.originalName}: expected exactly one documented original, found ${candidates.length}`,
      ];
    });

    expect(failures, failures.join("\n")).toEqual([]);
  });
});

const rateLimitSource = readFileSync(new URL("../src/rate-limit.ts", import.meta.url), "utf8");
const entrypointSource = readFileSync(new URL("../src/entrypoint.ts", import.meta.url), "utf8");
const runtimeEntrypointSource = readFileSync(new URL("../src/runtime-entrypoint.ts", import.meta.url), "utf8");
const outboundFetchPolicySource = readFileSync(new URL("../src/outbound-fetch-policy.ts", import.meta.url), "utf8");
const oidcReplaySource = readFileSync(new URL("../src/oidc-replay.ts", import.meta.url), "utf8");

describe("credential-boundary public API semantics", () => {
  it("documents rate-limit trust, failures, and Durable Object methods", () => {
    expectPublicDoc(rateLimitSource, "export interface DistributedRateLimitEnv", ["Durable Object", "limit"]);
    expectPublicDoc(rateLimitSource, "export type DistributedRateLimitDecision", ["allowed", "remaining", "retry"]);
    expectPublicDoc(rateLimitSource, "export class DistributedRateLimitUnavailable", ["fail", "rate-limit"]);
    expectPublicDoc(rateLimitSource, "export function trustedClientIdentifier", ["CF-Connecting-IP", "trusted"]);
    expectPublicDoc(rateLimitSource, "export async function distributedRateLimitObjectName", ["@throws", "hash"]);
    expectPublicDoc(rateLimitSource, "export async function checkDistributedRateLimit", ["@throws", "Durable Object"]);
    expectPublicDoc(rateLimitSource, "  async fetch(request: Request): Promise<Response>", ["@param", "@returns", "fail"]);
    expectPublicDoc(rateLimitSource, "  async alarm(): Promise<void>", ["@returns", "cleanup", "reschedule"]);
  });

  it("documents request-edge, runtime-readiness, and credential-egress boundaries", () => {
    expectPublicDoc(entrypointSource, "export function isTrustedGithubApiBase", ["exact", "origin"]);
    expectPublicDoc(entrypointSource, "export function isBoundedOidcBearer", ["credential"]);
    expectPublicDoc(entrypointSource, "export async function boundExchangeJsonBody", ["byte", "stream"]);
    expectPublicDoc(entrypointSource, "export default {", ["Worker", "/exchange", "fail"]);
    expectPublicDoc(runtimeEntrypointSource, "export default {", ["/ready", "Worker", "readiness"]);
    expectPublicDoc(outboundFetchPolicySource, "export function isTrustedCredentialEgress", ["allowlist"]);
    expectPublicDoc(outboundFetchPolicySource, "export function isTrustedCredentialEgressRequest", ["credential"]);
    expectPublicDoc(outboundFetchPolicySource, "export function createFailClosedFetch", ["redirect", "timeout"]);
    expectPublicDoc(outboundFetchPolicySource, "export function ensureGlobalOutboundFetchPolicy", ["tamper"]);
  });

  it("documents OIDC replay authority, failures, and Durable Object methods", () => {
    expectPublicDoc(oidcReplaySource, "export interface OidcReplayProtectionEnv", ["Durable Object", "binding"]);
    expectPublicDoc(oidcReplaySource, "export type OidcReplayClaimDecision", ["accepted", "expiry"]);
    expectPublicDoc(oidcReplaySource, "export class OidcReplayDetected", ["replay", "expiry"]);
    expectPublicDoc(oidcReplaySource, "export class OidcReplayUnavailable", ["fail", "replay"]);
    expectPublicDoc(oidcReplaySource, "export async function oidcReplayObjectName", ["@throws", "hash"]);
    expectPublicDoc(oidcReplaySource, "export async function claimOidcTokenUsage", ["@throws", "replay"]);
    expectPublicDoc(oidcReplaySource, "export class NoemaOidcReplayGuard", ["Durable Object", "atomic"]);
    expectPublicDoc(oidcReplaySource, "  async fetch(request: Request): Promise<Response>", ["@param", "@returns", "replay"]);
    expectPublicDoc(oidcReplaySource, "  async alarm(): Promise<void>", ["@returns", "cleanup", "reschedule"]);
  });
});
