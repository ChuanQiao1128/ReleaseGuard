# 2024-02 Cart Quantity Rounding

## Summary

Cart quantity updates rounded fractional input inconsistently.

## Impact

The cart total preview could briefly show the wrong item count. Discount code
validation remained unchanged.

## Resolution

Quantity parsing now rejects fractional values before totals are recomputed.
