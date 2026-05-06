# ADR 0005: Payment Provider Selection

## Context

The application needs a payment provider abstraction for future purchase
completion work.

## Decision

Use a provider adapter layer so payment authorization code can be swapped without
changing UI components.

## Consequences

Payment provider failures should be isolated from promotion-code validation.
