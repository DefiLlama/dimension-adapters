# Open Interest Guidelines

These guidelines apply to all adapters in the `open-interest/` directory.

## Dimensions

| Dimension | Required | Description |
|-----------|----------|-------------|
| `openInterestAtEnd` | YES | Total open interest at period end |
| `longOpenInterestAtEnd` | Optional | Long positions open interest |
| `shortOpenInterestAtEnd` | Optional | Short positions open interest |

## What is Open Interest?

Open Interest (OI) represents the total value of outstanding derivative contracts that have not been settled.

## Data Sources

1. **Contract state queries** - Direct contract calls for current OI
2. **Event log aggregation** - Sum position open/close events
3. **Protocol APIs** - For complex multi-market protocols
4. **Subgraphs** - Historical OI data

## Example Implementation

```typescript
const fetch = async (options: FetchOptions) => {
  const openInterest = options.createBalances();
  
  const oi = await options.api.call({
    target: PERP_CONTRACT,
    abi: 'function openInterest() view returns (uint256)'
  });
  
  openInterest.addUSDValue(oi);
  
  return { openInterestAtEnd: openInterest };
};
```

## Fees/Revenue Tracking

If this adapter returns fee/revenue dimensions, follow the guidelines in `fees/AGENTS.md`.

## Common Mistakes to Avoid

1. Using beginning-of-period OI instead of end
2. Not accounting for leverage in notional calculations
3. Missing multi-market aggregation
4. Not handling liquidated positions

## Units and sources

- Export open interest in USD (contracts times price for the window), never raw contract units.
- Cover both sides (longs + shorts) uniformly; OI should be roughly TVL-stable, a wild day-to-day swing usually means a unit or side bug.
- A source that only serves current OI uses `runAtCurrTime: true`; snapshot metrics never carry cumulative columns.
- OI is a snapshot at the window end, never a sum over the window. Under `pullHourly` a summed OI comes out 24x too high.
- Open interest is a perps metric; options protocols export notional and premium volume instead.
