# Options Aggregator Guidelines

These guidelines apply to all adapters in the `aggregator-options/` directory.

## Required Dimensions

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyNotionalVolume` | YES | Notional volume of options contracts traded/settled |
| `dailyPremiumVolume` | YES | Premium volume collected/paid |

## What is an Options Aggregator?

Options aggregators route options trades through multiple protocols/vaults to find optimal pricing and execution.

## Volume Types

### Notional Volume
- The underlying value of options contracts
- Example: A call option on 1 ETH at $2000 strike has $2000 notional value

### Premium Volume
- The actual premium paid/received for options contracts
- This is what users actually pay to enter positions

## Optional Dimensions

| Dimension | Description |
|-----------|-------------|
| `openInterestAtEnd` | Total open interest at period end |
| `longOpenInterestAtEnd` | Long positions open interest |
| `shortOpenInterestAtEnd` | Short positions open interest |

## Data Sources

1. **On-chain logs** - Option settlement and exercise events
2. **Protocol APIs** - Complex options data
3. **Query engines** - For aggregated analysis

## Fees/Revenue Tracking

If the aggregator charges fees and this adapter returns fee/revenue dimensions, follow the guidelines in `fees/GUIDELINES.md`.

## Common Mistakes to Avoid

1. Confusing notional vs premium volume
2. Double-counting with underlying options protocol adapters
3. Not tracking both call and put options
4. Missing settlement/exercise fees
