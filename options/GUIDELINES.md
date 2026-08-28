# Options DEX Guidelines

These guidelines apply to all adapters in the `options/` directory.

## Required Dimensions

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyNotionalVolume` | YES | Notional volume of options contracts traded/settled |
| `dailyPremiumVolume` | YES | Premium volume collected/paid |

## Volume Types

### Notional Volume
- The underlying value of options contracts
- Represents exposure, not actual capital deployed
- Example: Call option on 10 ETH at $2000 strike = $20,000 notional

### Premium Volume
- Actual premium paid by option buyers
- This is real capital changing hands
- More relevant for revenue calculations

## Optional Dimensions

| Dimension | Description |
|-----------|-------------|
| `openInterestAtEnd` | Total open interest at period end |
| `longOpenInterestAtEnd` | Long positions (buyers) open interest |
| `shortOpenInterestAtEnd` | Short positions (sellers) open interest |

## Data Sources

1. **On-chain logs** - Option minting, exercise, settlement events
2. **Protocol subgraphs** - Historical options data
3. **Query engines** - Complex options analysis

## Example Implementation

```typescript
const fetch = async (options: FetchOptions) => {
  const dailyNotionalVolume = options.createBalances();
  const dailyPremiumVolume = options.createBalances();
  
  const logs = await options.getLogs({
    target: OPTIONS_CONTRACT,
    eventAbi: 'event OptionPurchased(address underlying, uint256 strike, uint256 notional, uint256 premium)'
  });
  
  logs.forEach(log => {
    dailyNotionalVolume.addUSDValue(log.notional);
    dailyPremiumVolume.addUSDValue(log.premium);
  });
  
  return { dailyNotionalVolume, dailyPremiumVolume };
};
```

## Fees/Revenue Tracking

If this adapter returns fee/revenue dimensions, follow the guidelines in `fees/GUIDELINES.md`. Options protocols typically have:
- **Trading fees** - Fee on premium
- **Settlement fees** - Fee on exercise/settlement
- **Vault management fees** - For vault-based options

## Common Mistakes to Avoid

1. Confusing notional and premium volume
2. Not tracking both buy and sell side
3. Missing exercise/settlement events
4. Double-counting expired options
5. Not separating call vs put metrics when useful
