import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const centralReview = readFileSync(".github/workflows/central-review.yml", "utf8");
const reviewerCi = readFileSync(".github/workflows/reviewer-ci.yml", "utf8");
const reviewerPyproject = readFileSync("reviewer/pyproject.toml", "utf8");
const corePyproject = readFileSync("packages/noema-core/pyproject.toml", "utf8");

describe("noema-core packaging and workflow contract", () => {
  it("makes the shared core importable everywhere reviewer code runs", () => {
    const sharedPath =
      "PYTHONPATH: ${{ github.workspace }}/reviewer:${{ github.workspace }}/packages/noema-core/src";

    expect(centralReview).toContain(sharedPath);
    expect(reviewerCi).toContain(sharedPath);
    expect(reviewerCi).not.toContain("PYTHONPATH=. python");
  });

  it("ships the shared module inside the reviewer wheel until noema-core has an immutable index release", () => {
    expect(reviewerPyproject).toContain('[tool.setuptools]');
    expect(reviewerPyproject).toContain('packages = ["noema_reviewer", "noema_core"]');
    expect(reviewerPyproject).toContain('[tool.setuptools.package-dir]');
    expect(reviewerPyproject).toContain('noema_core = "../packages/noema-core/src/noema_core"');
    expect(reviewerCi).toContain("smoke-test installed reviewer wheel");
  });

  it("smokes a CLI symbol that the installed reviewer actually exports", () => {
    expect(reviewerCi).toContain("from noema_reviewer.cli import parse_args");
    expect(reviewerCi).toContain('assert parse_args([]).repo == ""');
    expect(reviewerCi).not.toContain("from noema_reviewer.cli import build_parser");
  });

  it("keeps the provider SDK extra at the reviewer integration adapter", () => {
    expect(reviewerPyproject).toContain('"pydantic-ai-slim[openai]>=2.9.0,<3"');
    expect(corePyproject).toContain('"pydantic-ai-slim>=2.9.0,<3"');
    expect(corePyproject).not.toContain("pydantic-ai-slim[openai]");
  });

  it("runs shared-core coverage and docstring gates in required reviewer CI", () => {
    expect(reviewerCi).toContain("test noema-core (100% line+branch coverage gate)");
    expect(reviewerCi).toContain("docstring coverage noema-core (100% gate)");
  });
});
