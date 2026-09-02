import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readNoemaWorkerConfig } from "../scripts/lib/cloudflare-worker-config.mjs";

const temporaryRoots = [];

async function fixture(source) {
  const root = await mkdtemp(join(tmpdir(), "noema-worker-config-"));
  temporaryRoots.push(root);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, "wrangler.toml"), source, "utf8");
  return root;
}

const validConfig = `
name = "noema"
main = "src/runtime-entrypoint.ts"
compatibility_date = "2026-06-30"

[[durable_objects.bindings]]
name = "NOEMA_RATE_LIMITER"
class_name = "NoemaRateLimiter"

[exports.NoemaRateLimiter]
type = "durable-object"
storage = "sqlite"

[vars]
ALLOWED_ISSUER = "https://token.actions.githubusercontent.com"
`;

afterEach(async () => {
  await Promise.all(
    temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe("Noema Worker configuration adapter", () => {
  it("preserves the owned Worker identity, Durable Object binding, and plain-text vars", async () => {
    const root = await fixture(validConfig);

    await expect(readNoemaWorkerConfig(root)).resolves.toEqual({
      name: "noema",
      main: "src/runtime-entrypoint.ts",
      compatibilityDate: "2026-06-30",
      durableObjects: [
        { name: "NOEMA_RATE_LIMITER", class_name: "NoemaRateLimiter" },
      ],
      vars: {
        ALLOWED_ISSUER: "https://token.actions.githubusercontent.com",
      },
    });
  });

  it("fails closed when an unimplemented configuration section appears", async () => {
    const root = await fixture(`${validConfig}\n[observability]\nenabled = "true"\n`);

    await expect(readNoemaWorkerConfig(root)).rejects.toThrow(
      /Unsupported Worker configuration section/u,
    );
  });

  it("fails closed when a root field would be silently omitted", async () => {
    const root = await fixture(`${validConfig}\ncompatibility_flags = "nodejs_compat"\n`);

    await expect(readNoemaWorkerConfig(root)).rejects.toThrow(
      /Unsupported root Worker key/u,
    );
  });

  it("rejects duplicate configuration authority", async () => {
    const root = await fixture(validConfig.replace(
      'ALLOWED_ISSUER = "https://token.actions.githubusercontent.com"',
      'ALLOWED_ISSUER = "https://token.actions.githubusercontent.com"\nALLOWED_ISSUER = "https://example.invalid"',
    ));

    await expect(readNoemaWorkerConfig(root)).rejects.toThrow(/Duplicate Worker var key/u);
  });

  it("requires every Durable Object binding to keep its declared sqlite export", async () => {
    const root = await fixture(validConfig.replace('storage = "sqlite"', 'storage = "memory"'));

    await expect(readNoemaWorkerConfig(root)).rejects.toThrow(
      /must remain durable-object\/sqlite/u,
    );
  });
});
