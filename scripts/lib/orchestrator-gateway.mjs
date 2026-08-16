import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const DEFAULT_ROUTING_ALIAS = "contextual-orchestrator";
const HEALTH_TIMEOUT_MS = 15_000;
const HEALTH_BODY_LIMIT_BYTES = 65_536;
const DIRECT_PROVIDER_HOSTS = Object.freeze([
  "api.openai.com",
  "models.github.ai",
  "openrouter.ai",
  "integrate.api.nvidia.com",
  "api.nvidia.com",
  "api.bytez.com",
]);
const OPENCODE_PROVIDER_ID = "contextual-orchestrator";
const FORBIDDEN_PROVIDER_KEYS = Object.freeze([
  "NVIDIA_NIM_API_KEY",
  "NVIDIA_NIM_API_KEY_SUB",
  "BYTEZ_API_KEY",
  "OPENROUTER_API_KEY",
  "OPENAI_API_KEY",
  "COPILOT_GITHUB_TOKEN",
]);
const GATEWAY_CONSUMERS = Object.freeze([
  Object.freeze({
    id: "noema-review",
    repository: "ContextualWisdomLab/noema",
    role: "github-review",
    wiring: "this-repository",
  }),
  Object.freeze({
    id: "noema-hourly-product-development",
    repository: "ContextualWisdomLab/noema",
    role: "product-development",
    wiring: "this-repository",
  }),
  Object.freeze({
    id: "naruon-judgments",
    repository: "ContextualWisdomLab/naruon",
    role: "judgments-and-decisions",
    wiring: "separate-repository-pr",
  }),
]);

/**
 * Hostnames that implement an OpenAI-compatible API but are direct providers.
 * Noema must not call these; provider selection stays in the orchestrator.
 *
 * @returns {readonly string[]} Exact lowercase hostnames.
 */
export function directProviderHosts() {
  return DIRECT_PROVIDER_HOSTS;
}

/**
 * Default routing alias the orchestrator uses to pick min-cost / max-performance.
 *
 * @returns {string} Gateway model name.
 */
export function defaultOrchestratorModel() {
  return DEFAULT_ROUTING_ALIAS;
}

/**
 * Upstream provider and Copilot token names that must stay out of Noema and naruon.
 *
 * @returns {readonly string[]} Exact environment/secret names.
 */
export function forbiddenProviderKeys() {
  return FORBIDDEN_PROVIDER_KEYS;
}

/**
 * First-class LLM consumers of this gateway contract.
 *
 * naruon judgments and decisions are a first-class consumer. Wiring that
 * runtime is a separate repository pull request.
 *
 * @returns {readonly object[]} Consumer descriptors without secrets.
 */
export function orchestratorGatewayConsumers() {
  return GATEWAY_CONSUMERS;
}

/**
 * Secret-free consumer contract that naruon can copy or import.
 *
 * This is the reusable Noema-side interface: HTTPS `/v1` URL, routing alias
 * `contextual-orchestrator`, dedicated inference token, no provider keys, and
 * no sequential model list. It does not include the OpenCode config writer.
 *
 * @returns {Readonly<object>} Machine-readable contract.
 */
export function orchestratorGatewayConsumerContract() {
  return Object.freeze({
    id: "contextual-orchestrator-gateway",
    version: 1,
    service: "contextual-orchestrator",
    routing_alias: DEFAULT_ROUTING_ALIAS,
    api_url: Object.freeze({
      scheme: "https",
      pathname_suffix: "/v1",
      allow_userinfo: false,
      allow_query: false,
      allow_fragment: false,
    }),
    healthz: Object.freeze({
      unauthenticated: true,
      identity: Object.freeze({
        status: "ok",
        service: "contextual-orchestrator",
      }),
    }),
    transport_names: Object.freeze({
      api_url: "NOEMA_LLM_API_URL",
      model: "NOEMA_LLM_MODEL",
      api_key: "NOEMA_LLM_API_KEY",
    }),
    dedicated_inference_token: true,
    sequential_model_candidates: false,
    forbidden_provider_keys: FORBIDDEN_PROVIDER_KEYS,
    forbidden_direct_provider_hosts: DIRECT_PROVIDER_HOSTS,
    consumers: GATEWAY_CONSUMERS,
    naruon_first_class_consumer: true,
    naruon_wiring: "separate-repository-pr",
  });
}

/**
 * Serialize the consumer contract as stable pretty-printed JSON.
 *
 * @returns {string} JSON document with a trailing newline.
 */
export function serializeOrchestratorGatewayConsumerContract() {
  return `${JSON.stringify(orchestratorGatewayConsumerContract(), null, 2)}\n`;
}

/**
 * Read one CI-transport setting without treating process.env as a secret store.
 *
 * GitHub Actions and local tests hand values to this function. Runtime Worker
 * secrets continue to use the typed `Env` binding, not this helper.
 *
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} source Transport map.
 * @param {string} name Setting name.
 * @returns {string} Trimmed value, or an empty string when absent.
 */
export function readGatewayTransportValue(source, name) {
  const raw = source?.[name];
  return typeof raw === "string" ? raw.trim() : "";
}

/**
 * Redact credential-shaped tokens from a diagnostic string.
 *
 * @param {unknown} error Failure to render.
 * @returns {string} Bounded, non-secret diagnostic.
 */
export function boundedGatewayError(error) {
  return String(error?.message ?? error)
    .replace(/\b(?:sk-|nvapi-|bytez_|or-)?[A-Za-z0-9_\-]{16,}\b/g, "[REDACTED]")
    .replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .slice(0, 1_024);
}

/**
 * Parse and accept only an HTTPS OpenAI-compatible gateway base URL ending in /v1.
 *
 * @param {string} rawUrl Candidate `NOEMA_LLM_API_URL`.
 * @returns {{ href: string, healthzUrl: string, hostname: string }} Canonical URL parts.
 * @throws {Error} When the URL is not the production gateway contract.
 */
export function parseOrchestratorGatewayUrl(rawUrl) {
  const apiUrl = String(rawUrl ?? "").trim();
  let parsed;
  try {
    parsed = new URL(apiUrl);
  } catch {
    throw new Error("NOEMA_LLM_API_URL must be an absolute HTTPS URL");
  }
  if (parsed.protocol !== "https:" || !parsed.hostname) {
    throw new Error("NOEMA_LLM_API_URL must be an absolute HTTPS URL");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      "NOEMA_LLM_API_URL must not contain credentials, query, or fragment",
    );
  }
  const hostname = parsed.hostname.toLowerCase();
  if (DIRECT_PROVIDER_HOSTS.includes(hostname)) {
    throw new Error(
      "Noema production jobs must use contextual-orchestrator, not a direct model provider",
    );
  }
  const path = parsed.pathname.replace(/\/+$/u, "") || "";
  if (!path.endsWith("/v1")) {
    throw new Error("NOEMA_LLM_API_URL must end in /v1");
  }
  const healthPath = `${path.slice(0, -3)}/healthz`;
  parsed.pathname = path;
  parsed.search = "";
  parsed.hash = "";
  const healthUrl = new URL(parsed.href);
  healthUrl.pathname = healthPath;
  return {
    href: parsed.href,
    healthzUrl: healthUrl.href,
    hostname,
  };
}

/**
 * Resolve the single routing alias. Empty input becomes the default alias.
 *
 * @param {string} rawModel Candidate `NOEMA_LLM_MODEL`.
 * @returns {string} Single gateway model name.
 * @throws {Error} When the value looks like a sequential candidate list.
 */
export function resolveOrchestratorModel(rawModel) {
  const model = String(rawModel ?? "").trim() || DEFAULT_ROUTING_ALIAS;
  if (/\s/u.test(model) || model.includes(",")) {
    throw new Error(
      "NOEMA_LLM_MODEL must be one routing alias; sequential model candidates are not allowed",
    );
  }
  if (model.startsWith("nvidia-nim/") || model.startsWith("openai/") || model.startsWith("github-models/")) {
    throw new Error(
      "NOEMA_LLM_MODEL must be the contextual-orchestrator routing alias, not a direct provider model",
    );
  }
  return model;
}

/**
 * Require a dedicated gateway inference token without returning or logging it.
 *
 * @param {string} rawKey Candidate `NOEMA_LLM_API_KEY`.
 * @returns {void}
 * @throws {Error} When the dedicated gateway token is missing.
 */
export function requireOrchestratorApiKey(rawKey) {
  if (!String(rawKey ?? "").trim()) {
    throw new Error("NOEMA_LLM_API_KEY is not configured");
  }
}

/**
 * Fetch `/healthz` without a bearer token and require the orchestrator identity.
 *
 * @param {string} healthzUrl Absolute health URL derived from the `/v1` base.
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number }} [options]
 * @returns {Promise<{ status: string, service: string }>} Parsed health document.
 * @throws {Error} When the response is not a bounded orchestrator identity.
 */
export async function verifyOrchestratorHealthz(healthzUrl, options = {}) {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const timeoutMs = options.timeoutMs ?? HEALTH_TIMEOUT_MS;
  if (typeof fetchImpl !== "function") {
    throw new Error("orchestrator healthz verification requires fetch");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (timeoutMs <= 0) {
    controller.abort();
  }
  let response;
  try {
    response = await Promise.race([
      fetchImpl(healthzUrl, {
        method: "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": "noema-orchestrator-gateway",
        },
        redirect: "error",
        signal: controller.signal,
      }),
      new Promise((_, reject) => {
        const onAbort = () => {
          reject(new Error("contextual-orchestrator health request timed out"));
        };
        if (controller.signal.aborted) {
          onAbort();
          return;
        }
        controller.signal.addEventListener("abort", onAbort, { once: true });
      }),
    ]);
  } catch (error) {
    throw new Error(
      `contextual-orchestrator health request failed: ${boundedGatewayError(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) {
    throw new Error(
      `contextual-orchestrator health response status is ${response.status}`,
    );
  }
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.length > HEALTH_BODY_LIMIT_BYTES) {
    throw new Error("contextual-orchestrator health response is too large");
  }
  let health;
  try {
    health = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("contextual-orchestrator health response is not JSON");
  }
  if (health?.status !== "ok" || health?.service !== "contextual-orchestrator") {
    throw new Error("NOEMA_LLM_API_URL did not identify contextual-orchestrator");
  }
  return { status: health.status, service: health.service };
}

/**
 * Build the single-provider OpenCode config that targets the gateway only.
 *
 * @param {{ apiUrl: string, model: string }} settings Validated gateway settings.
 * @returns {object} OpenCode configuration object.
 */
export function buildOpenCodeOrchestratorConfig(settings) {
  const gateway = parseOrchestratorGatewayUrl(settings.apiUrl);
  const model = resolveOrchestratorModel(settings.model);
  const providerModel = `${OPENCODE_PROVIDER_ID}/${model}`;
  return {
    $schema: "https://opencode.ai/config.json",
    share: "disabled",
    autoupdate: false,
    lsp: false,
    mcp: {},
    enabled_providers: [OPENCODE_PROVIDER_ID],
    model: providerModel,
    small_model: providerModel,
    permission: {
      "*": "allow",
      external_directory: "deny",
      task: "deny",
      question: "deny",
      webfetch: "deny",
      websearch: "deny",
      bash: "deny",
    },
    provider: {
      [OPENCODE_PROVIDER_ID]: {
        npm: "@ai-sdk/openai-compatible",
        name: "Contextual Orchestrator",
        options: {
          baseURL: gateway.href,
          apiKey: "{env:NOEMA_LLM_API_KEY}",
        },
        models: {
          [model]: {
            name: "Contextual Orchestrator",
            tool_call: true,
            limit: { context: 131072, output: 8192 },
          },
        },
      },
    },
  };
}

/**
 * Write the owner-only OpenCode config after the gateway URL is validated.
 *
 * @param {string} outputPath Destination file.
 * @param {{ apiUrl: string, model: string }} settings Validated gateway settings.
 * @returns {object} Written configuration.
 */
export function writeOpenCodeOrchestratorConfig(outputPath, settings) {
  const config = buildOpenCodeOrchestratorConfig(settings);
  mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
  writeFileSync(outputPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o400,
  });
  return config;
}

/**
 * Validate transport settings, confirm `/healthz`, and optionally write OpenCode config.
 *
 * @param {object} input
 * @param {NodeJS.ProcessEnv | Record<string, string | undefined>} input.env Transport map.
 * @param {typeof fetch} [input.fetchImpl]
 * @param {string} [input.openCodeConfigPath]
 * @returns {Promise<{ apiUrl: string, model: string, healthzUrl: string }>}
 */
export async function verifyOrchestratorGatewayContract(input) {
  const env = input.env ?? {};
  const apiUrl = readGatewayTransportValue(env, "NOEMA_LLM_API_URL");
  const apiKey = readGatewayTransportValue(env, "NOEMA_LLM_API_KEY");
  const model = resolveOrchestratorModel(
    readGatewayTransportValue(env, "NOEMA_LLM_MODEL"),
  );
  requireOrchestratorApiKey(apiKey);
  const gateway = parseOrchestratorGatewayUrl(apiUrl);
  await verifyOrchestratorHealthz(gateway.healthzUrl, {
    fetchImpl: input.fetchImpl,
  });
  if (input.openCodeConfigPath) {
    writeOpenCodeOrchestratorConfig(input.openCodeConfigPath, {
      apiUrl: gateway.href,
      model,
    });
  }
  return {
    apiUrl: gateway.href,
    model,
    healthzUrl: gateway.healthzUrl,
  };
}
