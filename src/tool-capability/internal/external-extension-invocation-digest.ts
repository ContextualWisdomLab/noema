import type { ExternalExtensionInvocationRequest } from "./external-extension-admission-core";

const DOMAIN = "noema.external_extension.invocation_envelope";
const VERSION = "v1";

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
}

/**
 * Produce the replay-equality digest for one already-normalized invocation envelope.
 *
 * The fixed tuple order is Noema's canonicalization contract. Cloudflare Workers'
 * Web Crypto implementation owns SHA-256; this module owns only the application
 * domain/version prefix and the semantic field ordering. Callers retain only the
 * fixed-width digest after this promise resolves, so plaintext request material is
 * not kept merely to decide later replay equality.
 *
 * @param request Already-normalized invocation envelope whose semantic fields must all be replay-bound.
 * @returns A versioned, domain-separated SHA-256 identity produced by the runtime Web Crypto provider.
 */
export async function digestExternalExtensionInvocationEnvelope(
  request: Readonly<ExternalExtensionInvocationRequest>,
): Promise<string> {
  const canonical = JSON.stringify([
    request.activation_id,
    request.invocation_id,
    request.execution_mode,
    request.invoked_at,
    request.instruction,
    request.observed_content,
    request.promote_observed_content,
    request.secret_material,
    request.product_record,
    request.hidden_reasoning,
  ]);
  const bytes = new TextEncoder().encode(`${DOMAIN}\0${VERSION}\0${canonical}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `${DOMAIN}:${VERSION}:sha256:${bytesToHex(new Uint8Array(digest))}`;
}
