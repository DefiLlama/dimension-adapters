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

## What counts as volume

- Volume is gross of fees (a buy's volume is amount in plus the fee).
- One side of the swap only. Swaps only: no LP add/remove, deposits/withdrawals, borrows, transfers, NFT trades or bet wagers (track their fees instead).
- Volume is verifiable USER action. A protocol's OWN actions (mint/redeem, hedging, rebalances) are never volume. Liquidations are not perp volume (they have their own `liquidations/` adapter type). HLP / market-maker / vault PnL is never fees.
- Beware per-side events: some order books emit a maker row AND a taker row for the same fill; summing both double counts.
- Ticker APIs: never sum `base_volume + quote_volume`, they are the same trades in two units. To check that an API reports single-sided volume, compare a low-liquidity pair's minute candle against its trade history (trade history is always taker volume).
- Prediction markets follow the Polymarket convention: volume = (maker + taker) / 2. State whether volume is cash (collateral paid) or notional; cash goes in `dailyVolume`, notional optionally in `dailyNotionalVolume`.
- Dune `dex.trades` / `dex_solana.trades` rows are per pool HOP. Aggregators, bots and terminals count one row per swap per trader (partition by tx AND trader; a tx-only key drops batched users). Exclude self-trades (maker == taker). Darkpool fills count the source leg only, never taker + filler.
- Trading bots, terminals and any venue whose swaps settle on a tracked DEX set `doublecounted: true`.
- A scam quote token priced off the "core asset" side (fake WETH/USDC pairs) can inflate volume by billions; the fix is the token blacklist, not a cap.
- Launchpads: count only pre-bonding volume on their own curve; post-migration volume belongs to the receiving DEX. Launchpads trading on another protocol's pools track fees only.
- Perp DEXs reporting very large volume (tens of millions per day and up) need per-trade maker/taker data before the number is trusted. Maker+taker complaints are answered with the normalized-volume metric, not adapter changes.
- Open interest is exported in USD (contracts times price for the window), never raw contract units. OI covers both sides (longs + shorts) uniformly and should be roughly TVL-stable; an OI source that only serves current data uses `runAtCurrTime`.
- No volume breakdowns: breakdown labels are for fees only.
- Set `doublecounted: true` when an underlying tracked protocol already counts the flow (e.g. Uniswap v4 hooks, builder codes).

## Fork listings go through the factories

Uniswap v2/v3 forks, Algebra forks and standard-subgraph DEXs are NOT new files. Add one config entry:

`factory/uniV2.ts` / `factory/uniV3.ts` (`configs` for volume, derives fees when ratios are present; `feesConfigs` for fees-only; uniV3 Algebra forks add `isAlgebraV3: true`):

```ts
'example-v2': {
  [CHAIN.BASE]: { factory: '0x...', start: '2025-01-01', fees: 0.25/100, userFeesRatio: 1, revenueRatio: 0.4, protocolRevenueRatio: 0.4 },
},
```

`factory/uniSubgraph.ts` (`graphUrls` are subgraph deployment IDs, not full URLs):

```ts
'example-spot': {
  graphUrls: { [CHAIN.BASE]: "<deployment id>" },
  totalVolume: { factory: "factories", field: 'totalVolumeUSD' },
  feesPercent: { type: "fees", ProtocolRevenue: 0, UserFees: 100, SupplySideRevenue: 100, Revenue: 0 },
  start: '2025-01-20',
},
```

- If the slug is already listed, extend the existing entry (add the chain) instead of adding a second key.
- Fee ratios only from the protocol's documented split; omit them rather than guess.
- Spam/fake tokens that pollute uni-style volume go in the central blacklist (`helpers/lists.ts`, `getDefaultDexTokensBlacklisted`), not into individual adapters.

## Fees/Revenue Tracking

If this adapter also tracks fees/revenue dimensions, follow the guidelines in `fees/AGENTS.md`. Include:
- `dailyFees` - All swap fees collected
- `dailyRevenue` - Protocol's portion of fees
- `dailySupplySideRevenue` - LP's portion of fees
- Appropriate breakdown labels and `breakdownMethodology`

## Trading-bot / router adapters

- Don't add both the buy leg and the sell leg of the same trade - that double-counts volume (a recurring JAM/aggregator-router bug).
- Trades and their fee transfers often live in **different transactions** - don't assume one tx hash covers both when matching trade volume to fees.
- For EVM trading bots, prefer on-chain logs over a backend API.

## Common Mistakes to Avoid

1. Double-counting volume (counting both sides of a swap, both buy+sell legs, or both taker+maker in perps)
2. Not filtering out wash trading
3. Missing multi-chain support when protocol exists on multiple chains
4. Not using helper functions when available (uniV2Exports, uniV3Exports)
5. Counting maker+taker volume for perpetuals instead of just taker volume
6. Using raw `topics` instead of a readable `eventAbi`
7. `methodology` keys using code field names (`dailyVolume`) instead of display names (`Volume`)
8. Missing fee/revenue breakdown + `breakdownMethodology` when the adapter also tracks fees
