import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript");
const TYPESCRIPT_PATH_PATTERN = /\.[cm]?tsx?$/;
const TRUSTED_COMPILER_OPTIONS = Object.freeze({
  target: ts.ScriptTarget.ES2022,
  module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.ReactJSX,
  isolatedModules: true,
  verbatimModuleSyntax: true,
  sourceMap: false,
});

/**
 * Transpile one TypeScript-family module with the image-owned compiler policy.
 *
 * Vite's built-in OXC transform discovers the nearest source-tree tsconfig for
 * every transformed file. The validator disables that transform and installs
 * this fixed pre-transform instead, so a repository-controlled tsconfig cannot
 * change syntax, JSX, module, or emit behavior during validation.
 *
 * @param {string} source - Untrusted module source text supplied by Vite.
 * @param {string} identifier - Vite module identifier, possibly with a query.
 * @returns {{code: string, map: null} | null} Fixed-policy output for
 * TypeScript-family modules, or `null` for ordinary JavaScript modules.
 */
export function trustedTypeScriptTransform(source, identifier) {
  const fileName = identifier.split("?", 1)[0];
  if (!TYPESCRIPT_PATH_PATTERN.test(fileName)) {
    return null;
  }
  const transformed = ts.transpileModule(source, {
    fileName,
    compilerOptions: TRUSTED_COMPILER_OPTIONS,
    reportDiagnostics: false,
  });
  return { code: transformed.outputText, map: null };
}

const trustedTypeScriptPlugin = Object.freeze({
  name: "noema-trusted-typescript-transform",
  enforce: "pre",
  transform: trustedTypeScriptTransform,
});

export default {
  oxc: false,
  plugins: [trustedTypeScriptPlugin],
  test: {
    include: ["test/**/*.test.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
    passWithNoTests: false,
    watch: false,
    coverage: {
      enabled: true,
      provider: "v8",
      include: ["src/**/*.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
      reporter: ["text", "json-summary"],
      thresholds: {
        100: true,
      },
    },
  },
};
