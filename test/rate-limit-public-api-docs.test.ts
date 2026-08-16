import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");
type TsNode = import("typescript").Node;
type TsSourceFile = import("typescript").SourceFile;
type TsStatement = import("typescript").Statement;
type TsExportDeclaration = import("typescript").ExportDeclaration;
type TsSymbol = import("typescript").Symbol;
type TsSyntaxKind = import("typescript").SyntaxKind;

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
const tsconfigPath = join(repositoryRoot, "tsconfig.json");

function sourcePaths(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return sourcePaths(path);
      return entry.isFile() && entry.name.endsWith(".ts") ? [path] : [];
    })
    .sort();
}

function projectCompilerOptions(): import("typescript").CompilerOptions {
  const config = ts.readConfigFile(tsconfigPath, ts.sys.readFile);
  if (config.error) {
    throw new Error(
      ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
    );
  }
  const parsed = ts.parseJsonConfigFileContent(
    config.config,
    ts.sys,
    repositoryRoot,
    undefined,
    tsconfigPath,
  );
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors
        .map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"))
        .join("\n"),
    );
  }
  return parsed.options;
}

function jsdocImmediatelyBefore(source: string, node: TsNode): string | undefined {
  const prefix = source.slice(node.getFullStart(), node.getStart());
  return prefix.match(/(\/\*\*[\s\S]*?\*\/)\s*$/)?.[1];
}

function meaningfulJSDoc(doc: string | undefined): boolean {
  return Boolean(doc && doc.length > 80 && !/\b(?:TODO|TBD)\b/i.test(doc));
}

function hasModifier(node: TsNode, kind: TsSyntaxKind): boolean {
  return Boolean(
    ts.canHaveModifiers(node)
    && ts.getModifiers(node)?.some((modifier) => modifier.kind === kind),
  );
}

function exported(node: TsNode): boolean {
  return hasModifier(node, ts.SyntaxKind.ExportKeyword);
}

type ParsedSource = {
  path: string;
  source: string;
  file: TsSourceFile;
};

type DirectExport = {
  name: string;
  path: string;
  source: string;
  file: TsSourceFile;
  node: TsNode;
  callable: boolean;
  parameterCount: number;
};

type ResolvedReexport = {
  exposedName: string;
  path: string;
  source: string;
  file: TsSourceFile;
  node: TsExportDeclaration;
  targetNodes: TsNode[];
  resolved: boolean;
};

type PublicApiInventory = {
  parsedSources: ParsedSource[];
  directExports: DirectExport[];
  reexports: ResolvedReexport[];
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

function documentationNode(node: TsNode): TsNode {
  let current: TsNode | undefined = node;
  while (current && !ts.isSourceFile(current)) {
    if (
      ts.isVariableStatement(current)
      || ts.isFunctionDeclaration(current)
      || ts.isClassDeclaration(current)
      || ts.isInterfaceDeclaration(current)
      || ts.isTypeAliasDeclaration(current)
      || ts.isEnumDeclaration(current)
      || ts.isModuleDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return node;
}

function collectPublicApi(directory: string): PublicApiInventory {
  const rootNames = sourcePaths(directory);
  const program = ts.createProgram(rootNames, projectCompilerOptions());
  const checker = program.getTypeChecker();
  const parsedSources = rootNames.map((path) => {
    const file = program.getSourceFile(path);
    if (!file) throw new Error(`TypeScript program did not load ${path}`);
    return {
      path: relative(directory, path).replaceAll("\\", "/"),
      source: file.text,
      file,
    };
  });
  const sourceByFileName = new Map(
    parsedSources.map((parsed) => [parsed.file.fileName, parsed] as const),
  );

  function resolveAlias(symbol: TsSymbol | undefined): TsSymbol | undefined {
    if (!symbol) return undefined;
    if (!(symbol.flags & ts.SymbolFlags.Alias)) return symbol;
    try {
      return checker.getAliasedSymbol(symbol);
    } catch {
      return undefined;
    }
  }

  function ownedDocumentationNodes(symbol: TsSymbol | undefined): TsNode[] {
    const resolved = resolveAlias(symbol);
    if (!resolved) return [];
    const unique = new Map<string, TsNode>();
    for (const declaration of resolved.declarations ?? []) {
      const parsed = sourceByFileName.get(declaration.getSourceFile().fileName);
      if (!parsed) continue;
      const node = documentationNode(declaration);
      const key = `${parsed.path}:${node.getStart(parsed.file)}`;
      unique.set(key, node);
    }
    return [...unique.values()];
  }

  function moduleExports(statement: TsExportDeclaration): TsSymbol[] | undefined {
    if (!statement.moduleSpecifier) return undefined;
    const moduleSymbol = checker.getSymbolAtLocation(statement.moduleSpecifier);
    if (!moduleSymbol) return undefined;
    try {
      return checker.getExportsOfModule(moduleSymbol);
    } catch {
      return undefined;
    }
  }

  const directExports: DirectExport[] = [];
  const reexports: ResolvedReexport[] = [];

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
        const clause = statement.exportClause;
        if (clause && ts.isNamedExports(clause)) {
          for (const element of clause.elements) {
            const symbol = checker.getSymbolAtLocation(element.name);
            const targetNodes = ownedDocumentationNodes(symbol);
            reexports.push({
              exposedName: element.name.text,
              path: parsed.path,
              source: parsed.source,
              file: parsed.file,
              node: statement,
              targetNodes,
              resolved: targetNodes.length > 0,
            });
          }
          continue;
        }

        const exportedSymbols = moduleExports(statement);
        if (clause && ts.isNamespaceExport(clause)) {
          const targetNodes = (exportedSymbols ?? []).flatMap((symbol) =>
            ownedDocumentationNodes(symbol)
          );
          reexports.push({
            exposedName: clause.name.text,
            path: parsed.path,
            source: parsed.source,
            file: parsed.file,
            node: statement,
            targetNodes,
            resolved: Boolean(exportedSymbols?.length) && targetNodes.length > 0,
          });
          continue;
        }

        if (!clause) {
          if (!exportedSymbols) {
            reexports.push({
              exposedName: "*",
              path: parsed.path,
              source: parsed.source,
              file: parsed.file,
              node: statement,
              targetNodes: [],
              resolved: false,
            });
            continue;
          }
          for (const symbol of exportedSymbols.filter((candidate) => candidate.name !== "default")) {
            const targetNodes = ownedDocumentationNodes(symbol);
            reexports.push({
              exposedName: symbol.name,
              path: parsed.path,
              source: parsed.source,
              file: parsed.file,
              node: statement,
              targetNodes,
              resolved: targetNodes.length > 0,
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

  return { parsedSources, directExports, reexports };
}

function reexportFailures(items: ResolvedReexport[]): string[] {
  return items.flatMap((item) => {
    const localDoc = jsdocImmediatelyBefore(item.source, item.node);
    if (meaningfulJSDoc(localDoc)) return [];
    if (!item.resolved || item.targetNodes.length === 0) {
      return [`${item.path} re-export ${item.exposedName}: module target is unresolved or ambiguous`];
    }
    const undocumented = item.targetNodes.filter((node) => {
      const sourceFile = node.getSourceFile();
      const source = sourceFile.text;
      return !meaningfulJSDoc(jsdocImmediatelyBefore(source, node));
    });
    if (undocumented.length === 0) return [];
    return [
      `${item.path} re-export ${item.exposedName}: ${undocumented.length} resolved declaration(s) lack meaningful JSDoc`,
    ];
  });
}

const inventory = collectPublicApi(sourceRoot);
const { parsedSources, directExports, reexports } = inventory;

function location(item: { path: string; file: TsSourceFile; node: TsNode }): string {
  const line = item.file.getLineAndCharacterOfPosition(item.node.getStart(item.file)).line + 1;
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

  it("resolves named, star, and namespace re-exports to their actual module declarations", () => {
    const failures = reexportFailures(reexports);
    expect(failures, failures.join("\n")).toEqual([]);
  });

  it("does not let an unrelated same-name declaration satisfy a re-export", () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-public-api-"));
    try {
      writeFileSync(
        join(directory, "documented.ts"),
        "/** This unrelated Credential is intentionally well documented so name-only matching would produce a false pass. */\nexport interface Credential { documented: true }\n",
      );
      writeFileSync(
        join(directory, "undocumented.ts"),
        "export interface Credential { documented: false }\nexport interface Other { value: string }\n",
      );
      writeFileSync(
        join(directory, "barrel.ts"),
        "export { Credential as PublicCredential } from './undocumented';\nexport * from './undocumented';\nexport * as UndocumentedNamespace from './undocumented';\n",
      );

      const failures = reexportFailures(collectPublicApi(directory).reexports).join("\n");
      expect(failures).toContain("PublicCredential");
      expect(failures).toContain("Other");
      expect(failures).toContain("UndocumentedNamespace");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("treats a named merged declaration as resolved when every owned declaration is documented", () => {
    const directory = mkdtempSync(join(tmpdir(), "noema-public-api-merged-"));
    try {
      writeFileSync(
        join(directory, "merged.ts"),
        "/** First half of a merged public contract with enough detail to qualify as meaningful adjacent API documentation. */\nexport interface MergedContract { first: string }\n/** Second half of the merged public contract with enough detail to qualify as meaningful adjacent API documentation. */\nexport interface MergedContract { second: string }\n",
      );
      writeFileSync(
        join(directory, "barrel.ts"),
        "export { MergedContract } from './merged';\n",
      );

      const merged = collectPublicApi(directory).reexports.find(
        (item) => item.exposedName === "MergedContract",
      );
      expect(merged?.resolved).toBe(true);
      expect(merged?.targetNodes.length).toBe(2);
      expect(reexportFailures(merged ? [merged] : [])).toEqual([]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
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