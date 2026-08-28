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

If this adapter returns fee/revenue dimensions, follow the guidelines in `fees/GUIDELINES.md`.

## Common Mistakes to Avoid

1. Using beginning-of-period OI instead of end
2. Not accounting for leverage in notional calculations
3. Missing multi-market aggregation
4. Not handling liquidated positions
