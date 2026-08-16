# Rate-limit decision response integrity

## Scope

Noema's credential-exchange worker delegates distributed rate-limit state to a Cloudflare Durable Object. The worker treats the object response as security-relevant input because `allowed`, `limit`, `remaining`, and `retry_after_seconds` directly control whether credential exchange proceeds and what retry guidance is returned.

The response boundary therefore fails closed before semantic validation when retained response bytes are ambiguous or exceed the reviewed protocol budget.

## Implemented boundary

`checkDistributedRateLimit()` continues to require HTTP 200 and `application/json`. Before JSON parsing, the caller now:

1. rejects a declared response larger than 4,096 bytes before body consumption;
2. streams an undeclared/chunked body and aborts once the same 4,096-byte ceiling is exceeded;
3. decodes the exact bytes with fatal UTF-8 semantics rather than replacement decoding;
4. detects duplicate decoded top-level decision keys, including escape-equivalent spellings such as `allowed` and `all\u006fwed`, before JavaScript last-key-wins parsing can collapse them;
5. parses JSON only after those byte-integrity checks; and
6. preserves the existing typed decision validation and `DistributedRateLimitUnavailable` fail-closed boundary.

The duplicate-key detector is intentionally scoped to the four security-relevant decision members instead of creating a second general-purpose JSON parser in the Worker runtime. It tracks JSON string escaping and structural depth so nested or string-contained names do not become false top-level duplicates.

## Evidence and limitations

`test/rate-limit-response-integrity.test.ts` exercises malformed UTF-8 embedded in an otherwise valid decision, an escape-equivalent duplicate `allowed` key, an oversized chunked response, and an oversized declared response that must be rejected before the body parser is invoked. Existing response-protocol tests retain the ordinary valid-decision path and the exact HTTP/media-type contract.

This control protects the local Worker-to-Durable-Object response parser. It does not authenticate a different Cloudflare account, establish production deployment truth, prove release acceptance, choose an outbound license, or create acquisition evidence. Durable Object placement, platform isolation, and provider control-plane identity remain external operational evidence.

## Standards rationale

RFC 8259 states that object member names should be unique and notes that software behavior is unpredictable when names are not unique. I-JSON strengthens this into a requirement that object names must not be duplicated. For a decision object whose fields directly control credential-exchange admission, Noema therefore rejects duplicate decoded decision names rather than relying on a parser's last-key-wins behavior.

Cloudflare documents Durable Object stubs as using the Fetch API model. Treating the returned `Response` as a bounded stream rather than assuming a small trusted object keeps Noema's application protocol fail closed even when `Content-Length` is absent.

NIST's current SSDF 1.1 remains the finalized baseline, while the December 2025 SP 800-218 Rev. 1 publication is an Initial Public Draft for SSDF 1.2. This change follows the SSDF practice of defining and verifying explicit software security requirements without presenting draft guidance as a finalized standard.

## References

Bray, T. (2015). *The I-JSON message format* (RFC 7493). Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc7493

Bray, T. (2017). *The JavaScript Object Notation (JSON) data interchange format* (RFC 8259; STD 90). Internet Engineering Task Force. https://www.rfc-editor.org/rfc/rfc8259

Cloudflare. (2026). *Durable Objects API: DurableObjectStub*. Cloudflare Developers. https://developers.cloudflare.com/durable-objects/api/stub/

National Institute of Standards and Technology. (2022). *Secure Software Development Framework (SSDF) version 1.1: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218). https://doi.org/10.6028/NIST.SP.800-218

National Institute of Standards and Technology. (2025). *Secure Software Development Framework (SSDF) version 1.2: Recommendations for mitigating the risk of software vulnerabilities* (NIST Special Publication 800-218 Rev. 1, Initial Public Draft). https://csrc.nist.gov/pubs/sp/800/218/r1/ipd
