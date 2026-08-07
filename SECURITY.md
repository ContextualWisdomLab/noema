# Security Policy

Noema treats vulnerability reports as confidential, untrusted security evidence. A report can trigger investigation and remediation, but it cannot by itself authorize a merge, release, deployment, credential exchange, or public disclosure.

## Supported versions

Noema has not declared a production-ready release. Security support is therefore limited to the current development line and any exact release candidate explicitly identified by the maintainers.

| Surface | Security support |
| --- | --- |
| Current `main` and an explicitly named release candidate | Supported for investigation and remediation; pre-release only |
| A published release explicitly listed in a future update to this table | Supported only for the period stated in that update |
| Historical commits, forks, unofficial images, and unlisted deployments | Not supported |

A version string, tag, green check, or deployment URL is not proof of support. The exact source revision and, where applicable, immutable release and deployment identities must be supplied and verified.

## Report a vulnerability privately

1. Open this repository's **Security and quality** tab and select **Report a vulnerability** when that control is available.
2. If private vulnerability reporting is unavailable, open a public issue titled `Private security contact requested` and ask the maintainers to establish a private channel. **Do not include vulnerability details in a public issue.**
3. Repository administrators and security managers should create or use a draft repository security advisory instead of discussing the report in an ordinary issue or pull request.

Do not send secrets, personal data, exploit payloads, or unredacted production evidence through public issues, pull-request bodies, CI logs, model prompts, or public artifacts.

## What to include

Provide enough bounded evidence for an independent maintainer to reproduce and assess the report without guessing:

- the exact commit, release, or deployed version, including an immutable image, artifact, or deployment identity when relevant;
- the affected component, endpoint, workflow, integration boundary, or configuration;
- prerequisites, attacker capabilities, and the expected security property;
- concise reproduction steps and the observed result;
- the likely impact, affected users or data, and any evidence of exploitation;
- a minimal proof of concept that avoids destructive actions and sensitive data;
- redacted logs, timestamps, request identifiers, and environment details needed to distinguish a product defect from infrastructure or configuration drift;
- suggested remediation or compensating controls, when known;
- your preferred attribution and coordinated-disclosure constraints.

A report may be rejected or returned for clarification when it lacks an affected Noema surface, reproducible evidence, or a plausible security impact.

## Scope

In scope:

- source and configuration owned by `ContextualWisdomLab/noema`;
- Noema Worker routes, Durable Objects, scripts, packages, release evidence, and repository-owned workflows when tested against an environment you own or are explicitly authorized to assess;
- Noema's documented trust boundaries with `ContextualWisdomLab/.github`, `contextual-orchestrator`, `naruon`, and other CWL services when the defect is attributable to Noema;
- confidentiality, integrity, availability, authorization, credential, provenance, sandbox, tenant-isolation, data-governance, and supply-chain failures with a concrete impact.

Out of scope unless the owner separately authorizes testing:

- third-party services, accounts, infrastructure, or repositories not controlled by this project;
- social-media, employee, contractor, customer, or vendor accounts;
- unsupported commits, forks, unofficial packages, and modified images;
- scanner-only output without a reachable affected path or product-specific impact;
- duplicate reports that do not add material evidence.

For an upstream dependency vulnerability, report it to the upstream project as appropriate and explain the exact Noema exposure. Do not test a third party merely because Noema integrates with it.

## Authorized research and safe harbor

We consider good-faith security research against systems and data that you own, or that the project has explicitly authorized you to test, to be authorized when all of the following conditions are met:

- follow this policy and applicable law;
- use the minimum access and data needed to demonstrate the issue;
- avoid privacy violations, service degradation, data destruction, persistence, credential reuse, and lateral movement;
- stop immediately if you encounter credentials, personal data, confidential information, or another party's data; do not retain or redistribute it, and report the exposure privately;
- give the maintainers a reasonable opportunity to validate, remediate, and coordinate disclosure;
- do not demand payment, threaten disclosure, or misrepresent affiliation or authorization.

The following activities are not authorized:

- denial of service, resource exhaustion, traffic flooding, or tests likely to impair availability;
- social engineering, phishing, physical intrusion, harassment, or spam;
- destructive data modification, deletion, ransomware, or persistence;
- credential theft, secret exfiltration, accessing data beyond the minimum proof, or targeting another person's account;
- malicious dependency publication, package-name squatting, workflow compromise, or other supply-chain interference;
- testing third-party systems without their explicit authorization;
- public disclosure of exploit details before the coordinated process below.

For research that stays within this policy and targets systems the project owns or controls, the maintainers intend not to initiate legal action solely because of that research. This statement does not bind third parties, override applicable law, or authorize activity outside the stated scope. Ask privately before proceeding when the boundary is unclear.

## Response objectives

The following are service objectives, not contractual SLAs or a promise that every report is valid. Business days exclude weekends and public holidays applicable to the responding maintainers.

| Milestone | Objective |
| --- | --- |
| Acknowledge a complete private report | Within 3 business days |
| Initial triage for a plausible Critical or High issue | Within 5 business days |
| Initial triage for a plausible Medium or Low issue | Within 10 business days |
| Status update for an accepted open report | At least every 10 business days, unless a different cadence is agreed |
| Coordinated public disclosure | Normally within 90 calendar days after validation, or sooner when a safe fix and user guidance are available |

Active exploitation, credential compromise, tenant escape, sensitive-data exposure, or a CISA Known Exploited Vulnerabilities listing can require immediate containment and an accelerated timeline. Multi-vendor coordination, complex migrations, or user-safety concerns can justify a documented extension. Silence, a missed objective, or an automated status is not acceptance or permission to disclose confidential details.

## Validation and prioritization

The project uses CVSS v4.0 as a common technical-severity language, not as the sole remediation decision. Triage also considers:

- known exploitation and credible threat intelligence;
- internet exposure and reachable attack paths;
- privileges, secrets, tenant boundaries, and affected data;
- blast radius, safety, recoverability, and compensating controls;
- whether the issue affects current source, a supported release, or a deployed service;
- dependency and multi-service impact across the documented MSA boundary.

An empty scanner result, model judgement, commit status, or unverified proof of concept is not conclusive evidence that a component is safe. Risk exceptions and severity changes must be recorded with rationale and independent review.

## Coordinated disclosure

Accepted reports remain private while the project validates impact, prepares tests and remediation, and determines affected and fixed source or release identities. When appropriate, maintainers will use a draft GitHub Security Advisory, request a CVE, coordinate with affected vendors, prepare upgrade or mitigation guidance, and credit the reporter according to their preference.

Public disclosure should identify affected and fixed versions, residual risk, remediation, and authoritative evidence without publishing unnecessary secrets or personal data. Disclosure occurs after a fix or defensible mitigation is available, or on another timeline agreed with the reporter. A release is not security-accepted until its exact source, CI, security, coverage, review, provenance, packaging, and release-acceptance gates pass.

This project currently offers no public bug bounty and makes no payment commitment. A useful report is welcome regardless of compensation, but compensation must never be assumed or used as leverage for disclosure.

## Maintainer process

Maintainers follow [`docs/security/vulnerability-handling.md`](docs/security/vulnerability-handling.md). The standards basis and product-specific decisions are recorded in [`docs/doctoring/vulnerability-disclosure.md`](docs/doctoring/vulnerability-disclosure.md).
