# DEX Aggregator Guidelines

These guidelines apply to all adapters in the `aggregators/` directory.

## Required Dimensions

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyVolume` | YES | Trading volume routed through the aggregator |

## What is an Aggregator?

DEX aggregators route trades through multiple DEXs to find optimal prices. They aggregate liquidity but don't provide it themselves.

## Volume Calculation

- Track volume that is ROUTED through the aggregator
- Do NOT double-count volume that is already tracked in the underlying DEX adapters
- Aggregator volume represents user intent to trade through the aggregator interface

## Data Sources

1. **On-chain logs** - Track aggregator contract events
2. **Aggregator APIs** - When on-chain tracking is complex
3. **Query engines** - For cross-DEX aggregation analysis

## Common Event Patterns

```typescript
// Example: Track fill events from aggregator contract
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    target: AGGREGATOR_CONTRACT,
    eventAbi: 'event Fill(address taker, address makerToken, address takerToken, uint256 makerAmount, uint256 takerAmount)'
  });
  logs.forEach(log => {
    dailyVolume.add(log.takerToken, log.takerAmount);
  });
  return { dailyVolume };
};
```

## Fees/Revenue Tracking

If the aggregator charges fees and this adapter returns fee/revenue dimensions, follow the guidelines in `fees/GUIDELINES.md`. Common aggregator fee patterns:
- Positive slippage capture
- Integration fees
- Protocol fees on certain routes

## Common Mistakes to Avoid

1. Double-counting volume with underlying DEX adapters
2. Not tracking all chains the aggregator operates on
3. Missing integration/partner fees as supply-side revenue
4. Counting failed/reverted transactions
