# DEX Volume Adapter Guidelines

These guidelines apply to all adapters in the `dexs/` directory.

## Required Dimensions

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyVolume` | YES | Trading volume for the period |

## Volume Calculation Rules

### Spot DEX Volume
- Track actual trading volume from swap events
- Use on-chain data where possible - especially for chains with our indexer or significant volume
- Watch for wash trading - be vigilant on low-fee chains

### Perpetual/Derivatives Volume
- **Track TAKER volume ONLY** - do NOT double count by adding both taker and maker volumes
- The taker is the party that initiates the trade against existing orders
- This prevents inflating volume by 2x

## Data Sources (Preferred Order)

1. **On-chain event logs** - Most reliable, use `options.getLogs()`
2. **Subgraphs** - Good for protocols with maintained subgraphs
3. **Query engines** (Dune, Flipside, Allium) - For complex queries
4. **Protocol APIs** - Last resort, verify data accuracy

## Common Patterns

### Uniswap V2-style DEX
```typescript
import { uniV2Exports } from '../helpers/uniswap';

export default uniV2Exports({
  [CHAIN.ETHEREUM]: {
    factories: ['0x...'],
    fees: { type: 'fixed', feesPercentage: 0.3 }
  }
});
```

### Uniswap V3-style DEX
```typescript
import { uniV3Exports } from '../helpers/uniswap';

export default uniV3Exports({
  [CHAIN.ETHEREUM]: { factory: '0x...' }
});
```

### Custom Implementation
```typescript
const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const logs = await options.getLogs({
    target: CONTRACT,
    eventAbi: 'event Swap(address sender, uint256 amount0, uint256 amount1)'
  });
  logs.forEach(log => {
    dailyVolume.add(token0, log.amount0);
  });
  return { dailyVolume };
};
```

## Wash Trading Detection

- Apply minimum TVL percentage rules for pools with very low fee percentages (like 0.01%)
- Be extra vigilant on Solana due to lower transaction fees
- Remove affected pairs during farming campaigns that incentivize wash trading

## Fees/Revenue Tracking

If this adapter also tracks fees/revenue dimensions, follow the guidelines in `fees/GUIDELINES.md`. Include:
- `dailyFees` - All swap fees collected
- `dailyRevenue` - Protocol's portion of fees
- `dailySupplySideRevenue` - LP's portion of fees
- Appropriate breakdown labels and `breakdownMethodology`

## Common Mistakes to Avoid

1. Double-counting volume (counting both sides of a swap, or both taker+maker in perps)
2. Not filtering out wash trading
3. Missing multi-chain support when protocol exists on multiple chains
4. Not using helper functions when available (uniV2Exports, uniV3Exports)
5. Counting maker+taker volume for perpetuals instead of just taker volume
