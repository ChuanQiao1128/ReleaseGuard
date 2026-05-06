# ADR 0009: Test Data Seeding

## Context

Deterministic test data helps API tests avoid environment-specific fixtures.

## Decision

Use explicit seed objects in tests instead of shared mutable global state.

## Consequences

Tests should remain readable and local to each capability where possible.
