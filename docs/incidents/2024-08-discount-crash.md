# 2024-08 Discount Validation Crash

## Summary

A discount validation change caused invalid discount codes to return HTTP 500
instead of HTTP 400 during checkout.

## Impact

Users entering an invalid discount code saw a generic checkout failure instead of
a validation error. The checkout route was affected because it calls
`POST /api/discount/apply`.

## Root Cause

The discount API treated invalid user input as a server error. The expected
behavior is a controlled `400` response with an error message that the checkout
page can display.

## Resolution

Add or preserve invalid-discount API evidence whenever discount validation logic
changes. The existing `tests/api/discount.test.ts` invalid discount case should
fail if invalid discounts return HTTP 500.
