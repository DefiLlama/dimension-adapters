# Derivatives Aggregator Guidelines

These guidelines apply to all adapters in the `aggregator-derivatives/` directory.

## Required Dimensions

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyVolume` | YES | Perpetual/derivatives trading volume (TAKER volume only) |

## What is a Derivatives Aggregator?

Derivatives aggregators route perpetual and derivatives trades through multiple protocols to find optimal execution.

## Volume Calculation

- Track derivatives volume ROUTED through the aggregator
- **Track TAKER volume ONLY** - do NOT double-count by adding both taker and maker volumes
- Include perpetual swaps, futures, and other derivative products
- Do NOT double-count volume already tracked in underlying derivatives protocol adapters

## Optional Dimensions

| Dimension | Description |
|-----------|-------------|
| `openInterestAtEnd` | Total open interest at period end |
| `longOpenInterestAtEnd` | Long positions open interest |
| `shortOpenInterestAtEnd` | Short positions open interest |

## Data Sources

1. **On-chain logs** - Track aggregator contract events
2. **Protocol APIs** - When on-chain tracking is complex
3. **Query engines** - For complex aggregation analysis

## Fees/Revenue Tracking

If the aggregator charges fees and this adapter returns fee/revenue dimensions, follow the guidelines in `fees/GUIDELINES.md`. Include:
- `dailyFees` - All fees collected
- `dailyRevenue` - Aggregator's portion
- `dailySupplySideRevenue` - Partner/integration fees

## Common Mistakes to Avoid

1. Double-counting volume with underlying derivatives adapters
2. Mixing spot and derivatives volume
3. Not tracking all chains/protocols aggregated
4. Missing open interest tracking when available
5. Counting both taker AND maker volume (should only count taker)
