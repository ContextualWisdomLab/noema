# Noema Documentation Map

이 디렉터리는 Noema의 **canonical documentation graph**를 제공합니다. PR body, issue comment, automation summary는 실행 시점 evidence일 수 있지만 architecture source of truth를 대체하지 않습니다.

## Start here

| Need | Document |
| --- | --- |
| 제품이 누구를 위해 무엇을 해야 하는가 | [PRD](./PRD.md) |
| 기술적으로 어떤 invariant를 지켜야 하는가 | [TRD](./TRD.md) |
| runtime/MSA/trust boundary | [Architecture](../ARCHITECTURE.md) |
| 왜 이 결정을 했는가 | [ADR index](./adr/README.md) |
| component/sequence/state/topology 그림 | [UML](./UML.md) |
| persisted state와 conceptual evidence entities | [ERD](./ERD.md) |
| requirement → source/test/evidence 연결 | [Traceability](./TRACEABILITY.md) |
| 무엇을 어떻게 테스트하는가 | [Test Strategy](./TEST_STRATEGY.md) |
| activation/incident/rollback/production acceptance | [Operability](./OPERABILITY.md) |
| licensing, third-party obligations, IP transfer | [Licensing and IP transfer](./LICENSING_AND_IP_TRANSFER.md) |
| HTTP API prose contract | [API spec](./api-spec.md) |
| protected HTTP API machine contract | [OpenAPI 3.1](../openapi.json) |
| credential-exchange runtime 위협 | [Runtime threat model](./threat-model.md) |
| autonomous review/maintenance/publisher 위협 | [Automation threat model](./automation-threat-model.md) |
| 문서군의 충분성·잔여 gap·acceptance 상태 | [Documentation gap audit](./DOCUMENTATION_GAP_AUDIT.md) |
| 표준·primary-source 근거 | [Architecture doctoring](./doctoring/architecture-trust-boundaries.md) |

## Operations and release

- [Runtime runbook](./runbook.md)
- [Hourly commercial-readiness loop](./hourly-commercial-readiness-loop.md)
- [Hourly product-development loop](./operations/hourly-product-development.md)
- [Deployment guide](./deployment-guide.md)
- [Observability KPI](./observability-kpi.md)
- [Security validation checklist](./security-validation-checklist.md)
- [Release readiness audit](./release-readiness-audit.md)

## Commercial and acquisition evidence

- [Saleable program readiness](./saleable-program-readiness.md)
- [Acquisition readiness](./acquisition-readiness-2b.md)
- [Buyer due diligence index](./buyer-due-diligence-index.md)
- [Transfer readiness plan](./transfer-readiness-plan.md)
- [Pilot readiness checklist](./pilot-readiness-checklist.md)

These documents describe **requirements and evidence locations**. Missing real production/customer/revenue/transfer evidence must remain missing rather than being replaced by documentation.

## Status vocabulary

- **Implemented on protected main** — source/control family is protected truth; deployment/operational proof remains separate where applicable.
- **Implemented on active PR / In review** — behavior exists only on a current open head.
- **Accepted architecture** — a durable decision is accepted but may not yet be implemented.
- **Planned** — no implementation claim.
- **Research only** — evidence informs design but is not product behavior.
- **External evidence** — repository source alone cannot establish it.
- **Superseded** — retained historical decision replaced by a newer authority.
- **Out of scope** — explicitly not owned.

## Update rule

A material product/security/authority change should update the smallest complete set among PRD, TRD, Architecture, ADR, UML/ERD, threat models, API, Operability, Test Strategy, Traceability, documentation-gap audit and CHANGELOG. Do not duplicate the same mutable status in many documents when a canonical owner already exists. Remove obsolete PR numbers and transient check conclusions rather than preserving them as timeless architecture facts.
