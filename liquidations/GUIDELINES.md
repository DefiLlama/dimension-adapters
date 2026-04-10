# Liquidation Adapter Guidelines

These guidelines apply to all adapters in the `liquidations/` directory.

## Dimensions

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyCollateralLiquidated` | **YES** | Total USD value of collateral seized from borrowers during liquidation events |
| `dailyLiquidationVolume` | Optional | Total USD notional size of liquidated positions (perps/derivatives only) |

## Data Sources (Preferred Order)

1. **On-chain event logs** - Most reliable, use `options.getLogs()`
2. **Subgraphs** - Acceptable when on-chain is impractical
3. **Protocol APIs** - Last resort, verify data accuracy

## Common Patterns

### Aave Forks and Compound V2 Forks

Add entries directly to `factory/aaveLiquidations.ts` or `factory/compoundV2.ts` instead of creating standalone adapter files. Both factories auto-derive liquidation configs from their fee configs, so adding a protocol to fee tracking automatically picks it up for liquidations too. An entry is only necessary if the fork modifies the liquidation event signatures.

### Singleton Contracts (Morpho Blue, Compound V3)

```typescript
const fetch = async (options: FetchOptions) => {
  const dailyCollateralLiquidated = options.createBalances()

  const events = await options.getLogs({
    target: CONTRACT,
    eventAbi: 'event Liquidate(...)',
  })

  for (const event of events) {
    dailyCollateralLiquidated.add(collateralToken, event.seizedAssets)
  }

  return { dailyCollateralLiquidated }
}
```

### Factory-deployed Contracts (Euler, Silo, Fraxlend)

Fetch contract addresses from factory `Create` events with `cacheInCloud: true`, then fetch `Liquidate` events from each instance.

### Perp / Derivatives Protocols

Perp liquidation events typically include both `collateral` (margin lost) and `size` (leveraged position notional). Export both:

```typescript
dailyCollateralLiquidated.addUSDValue(Number(log.collateral) / 1e30)
dailyLiquidationVolume.addUSDValue(Number(log.size) / 1e30)
```

## USD Values

If the protocol's event includes a USD value field (e.g. Compound V3 `AbsorbCollateral.usdValue`, GMX `LiquidatePosition.collateral` scaled by 1e30), use `balances.addUSDValue()` for accurate pricing during volatile periods. Otherwise use `balances.add(token, amount)` for token-denominated amounts.

Liquidations often happen during price spikes/drops, so USD values from the event are preferred over token-denominated amounts when available.

## Shared Config

Import chain configs, addresses, and deployment blocks from existing `fees/` adapters when possible to avoid duplication.

## Testing

```bash
npm test liquidations <adapter-name>             # test with current time
npm test liquidations <adapter-name> 2024-03-11   # test a specific date
```

Test dates with known market volatility (e.g. depegs, crashes) to verify the adapter finds real liquidation events.
