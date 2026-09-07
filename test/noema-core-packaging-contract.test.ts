import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const centralReview = readFileSync(".github/workflows/central-review.yml", "utf8");
const reviewerCi = readFileSync(".github/workflows/reviewer-ci.yml", "utf8");
const reviewerPyproject = readFileSync("reviewer/pyproject.toml", "utf8");
const reviewerBuildBackend = readFileSync("reviewer/build_backend.py", "utf8");
const reviewerManifest = readFileSync("reviewer/MANIFEST.in", "utf8");
const corePyproject = readFileSync("packages/noema-core/pyproject.toml", "utf8");

describe("noema-core packaging and workflow contract", () => {
  it("makes the shared core importable everywhere reviewer code runs", () => {
    const sharedPath =
      "PYTHONPATH: ${{ github.workspace }}/reviewer:${{ github.workspace }}/packages/noema-core/src";

    expect(centralReview).toContain(sharedPath);
    expect(reviewerCi).toContain(sharedPath);
    expect(reviewerCi).not.toContain("PYTHONPATH=. python");
  });

  it("stages the canonical core into reviewer build artifacts until an immutable index release exists", () => {
    expect(reviewerPyproject).toContain('build-backend = "build_backend"');
    expect(reviewerPyproject).toContain('backend-path = ["."]');
    expect(reviewerPyproject).toContain('[tool.setuptools]');
    expect(reviewerPyproject).toContain('packages = ["noema_reviewer", "noema_core"]');
    expect(reviewerPyproject).toContain('[tool.setuptools.package-dir]');
    expect(reviewerPyproject).toContain('noema_core = "_build_include/noema_core"');
    expect(reviewerBuildBackend).toContain('"packages" / "noema-core" / "src" / "noema_core"');
    expect(reviewerBuildBackend).toContain('from setuptools import build_meta as _setuptools');
    expect(reviewerBuildBackend).toContain('def build_sdist(');
    expect(reviewerManifest).toContain('include build_backend.py');
    expect(reviewerManifest).toContain('recursive-include _build_include/noema_core *.py');
    expect(reviewerCi).toContain("smoke-test installed reviewer wheel and sdist-to-wheel path");
    expect(reviewerCi).toContain("from build_backend import build_sdist");
    expect(reviewerCi).toContain('python -m pip wheel "$sdist"');
    expect(reviewerCi).toContain("hashlib.sha256(installed_agent.read_bytes()).digest()");
  });

  it("does not retain the obsolete out-of-tree setuptools package mapping", () => {
    expect(reviewerPyproject).not.toContain(
      'noema_core = "../packages/noema-core/src/noema_core"',
    );
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
