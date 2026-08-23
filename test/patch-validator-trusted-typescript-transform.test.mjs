import { describe, expect, it } from "vitest";

import * as trustedConfiguration from "../patch-validator/validator-vitest.config.mjs";

function trustedTransform() {
  const transform = trustedConfiguration.trustedTypeScriptTransform;
  expect(transform).toBeTypeOf("function");
  return transform;
}

describe("image-owned TypeScript transform", () => {
  it("disables Vite OXC tsconfig discovery and installs the trusted transform", () => {
    const configuration = trustedConfiguration.default;

    expect(configuration.oxc).toBe(false);
    expect(configuration.plugins).toHaveLength(1);
    expect(configuration.plugins[0]).toMatchObject({
      name: "noema-trusted-typescript-transform",
      enforce: "pre",
      transform: trustedConfiguration.trustedTypeScriptTransform,
    });
  });

  it("transpiles TypeScript without consulting a source-owned tsconfig", () => {
    const transformed = trustedTransform()(
      'export const validatedValue: string = "new";\n',
      "/workspace/source/src/value.ts?import",
    );

    expect(transformed).toEqual({
      code: 'export const validatedValue = "new";\n',
      map: null,
    });
  });

  it("leaves non-TypeScript modules to Vite's normal JavaScript pipeline", () => {
    expect(
      trustedTransform()(
        'export const validatedValue = "new";\n',
        "/workspace/source/src/value.js",
      ),
    ).toBeNull();
  });
});
