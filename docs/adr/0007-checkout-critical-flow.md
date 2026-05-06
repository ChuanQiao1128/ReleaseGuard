# ADR 0007: Checkout Critical Flow

## Status

Accepted for the v0.2 repo memory demo.

## Context

Checkout is the primary revenue path in the demo application. The route `/checkout`
depends on `POST /api/discount/apply` for discount validation before the user can
complete the order review.

## Decision

ReleaseGuard should treat checkout and discount validation as historically
important repo memory. Structured dependencies still come from the Capability
Graph, but this ADR gives future retrieval a human explanation for why discount
validation changes need careful evidence.

## Consequences

Future v0.2 retrieval demos can surface this ADR when a PR changes the discount
API or checkout flow. Retrieval must not directly decide `PASS`, `WARN`, or
`BLOCK`; it can only add context for evidence planning and reviewer explanation.
