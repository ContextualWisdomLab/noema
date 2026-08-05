import { isTrustedGithubApiBase } from "./entrypoint";

const trustedAudiencePattern = /^[A-Za-z0-9._:-]{1,128}$/;
const trustedOwnerPattern = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const positiveDecimalPattern = /^[1-9][0-9]*$/;
const privateKeyPattern = /^-----BEGIN PRIVATE KEY-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END PRIVATE KEY-----$/;

export type RuntimeReadinessFailure =
  | "allowed_issuer"
  | "allowed_audience"
  | "allowed_repository_owner"
  | "allowed_workflow_repository"
  | "allowed_workflow_ref"
  | "github_api_base"
  | "github_app_id"
  | "github_app_private_key"
  | "github_app_installation_id";

export interface RuntimeReadinessEnv {
  ALLOWED_ISSUER?: string;
  ALLOWED_AUDIENCE?: string;
  ALLOWED_REPOSITORY_OWNER?: string;
  ALLOWED_WORKFLOW_REPOSITORY?: string;
  ALLOWED_WORKFLOW_REF_PREFIX?: string;
  GITHUB_API_BASE?: string;
  GITHUB_APP_ID?: string;
  GITHUB_APP_PRIVATE_KEY_PEM?: string;
  GITHUB_APP_INSTALLATION_ID?: string;
}

export interface RuntimeReadinessResult {
  ready: boolean;
  failedChecks: RuntimeReadinessFailure[];
}

function escapeRegularExpression(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isTrustedWorkflowRepository(value: string, owner: string): boolean {
  const escapedOwner = escapeRegularExpression(owner);
  return new RegExp(`^${escapedOwner}/[A-Za-z0-9_.-]{1,100}$`).test(value);
}

function isExactWorkflowRef(value: string, repository: string): boolean {
  const escapedRepository = escapeRegularExpression(repository);
  const workflowRefPattern = new RegExp(
    `^${escapedRepository}/\\.github/workflows/[A-Za-z0-9_.-]+\\.ya?ml@(?:refs/(?:heads|tags)/[A-Za-z0-9._/-]+|[0-9a-fA-F]{40})$`,
  );
  return workflowRefPattern.test(value);
}

async function isImportablePrivateKey(value: string | undefined): Promise<boolean> {
  try {
    const match = privateKeyPattern.exec(value ?? "");
    if (!match) throw new TypeError("PKCS#8 PEM envelope missing");
    const compact = match[1].replace(/\s+/g, "");
    const binary = atob(compact);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    await crypto.subtle.importKey(
      "pkcs8",
      bytes,
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["sign"],
    );
    return true;
  } catch {
    return false;
  }
}

/** Evaluate the offline configuration required for credential exchange traffic. */
export async function evaluateRuntimeReadiness(
  env: RuntimeReadinessEnv,
): Promise<RuntimeReadinessResult> {
  const failedChecks: RuntimeReadinessFailure[] = [];
  const owner = env.ALLOWED_REPOSITORY_OWNER ?? "";
  const workflowRepository = env.ALLOWED_WORKFLOW_REPOSITORY ?? "";
  const workflowRef = env.ALLOWED_WORKFLOW_REF_PREFIX ?? "";

  if (env.ALLOWED_ISSUER !== "https://token.actions.githubusercontent.com") {
    failedChecks.push("allowed_issuer");
  }
  if (!trustedAudiencePattern.test(env.ALLOWED_AUDIENCE ?? "")) {
    failedChecks.push("allowed_audience");
  }
  if (!trustedOwnerPattern.test(owner)) {
    failedChecks.push("allowed_repository_owner");
  }
  if (!isTrustedWorkflowRepository(workflowRepository, owner)) {
    failedChecks.push("allowed_workflow_repository");
  }
  if (!isExactWorkflowRef(workflowRef, workflowRepository)) {
    failedChecks.push("allowed_workflow_ref");
  }
  if (!isTrustedGithubApiBase(env.GITHUB_API_BASE)) {
    failedChecks.push("github_api_base");
  }
  if (!positiveDecimalPattern.test(env.GITHUB_APP_ID ?? "")) {
    failedChecks.push("github_app_id");
  }
  if (!await isImportablePrivateKey(env.GITHUB_APP_PRIVATE_KEY_PEM)) {
    failedChecks.push("github_app_private_key");
  }
  if (
    env.GITHUB_APP_INSTALLATION_ID !== undefined
    && !positiveDecimalPattern.test(env.GITHUB_APP_INSTALLATION_ID)
  ) {
    failedChecks.push("github_app_installation_id");
  }

  return {
    ready: failedChecks.length === 0,
    failedChecks,
  };
}
