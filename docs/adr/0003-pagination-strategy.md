# ADR 0003: Pagination Strategy

## Context

Product listing pages can grow quickly as the catalog expands.

## Decision

Use cursor pagination for catalog browsing and keep page-size defaults stable for
API consumers.

## Consequences

Pagination work should focus on product browsing performance, not purchase
completion or promotion validation behavior.
