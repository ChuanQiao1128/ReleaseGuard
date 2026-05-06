# 2023-04 Auth Token Leak

## Summary

An auth debug log accidentally included a bearer token in local development logs.

## Impact

The issue affected developer machines and did not touch checkout or discount
validation.

## Resolution

Debug logging now redacts authorization headers before printing request metadata.
