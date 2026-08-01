# Bridge Aggregator Guidelines

These guidelines apply to all adapters in the `bridge-aggregators/` directory.

## Required Dimensions

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyBridgeVolume` | YES | Bridge volume for the period |

## What is a Bridge Aggregator?

Bridge aggregators route cross-chain transfers through multiple bridges to find optimal routes, fees, and speed.

## Volume Calculation

- Track volume ROUTED through the bridge aggregator
- Include all cross-chain transfers facilitated
- Volume should reflect the value being bridged, not fees

## Data Sources

1. **On-chain logs** - Track bridge initiation/completion events
2. **Multi-chain indexing** - Required for tracking both source and destination
3. **Aggregator APIs** - When on-chain tracking across chains is complex

## Example Implementation

```typescript
const fetch = async (options: FetchOptions) => {
  const dailyBridgeVolume = options.createBalances();
  const logs = await options.getLogs({
    target: BRIDGE_AGGREGATOR,
    eventAbi: 'event BridgeInitiated(address token, uint256 amount, uint256 destChainId)'
  });
  logs.forEach(log => {
    dailyBridgeVolume.add(log.token, log.amount);
  });
  return { dailyBridgeVolume };
};
```

## Fees/Revenue Tracking

If the bridge aggregator charges fees and this adapter returns fee/revenue dimensions, follow the guidelines in `fees/GUIDELINES.md`. Include:
- `dailyFees` - All fees collected (bridge fees, relayer fees)
- `dailyRevenue` - Aggregator's portion
- `dailySupplySideRevenue` - Relayer/partner fees

## Common Mistakes to Avoid

1. Double-counting with underlying bridge adapters
2. Not tracking volume on all source chains
3. Counting failed/reverted bridge attempts
4. Missing multi-hop bridge routes
5. Confusing bridge volume with swap volume (if aggregator also does swaps)
