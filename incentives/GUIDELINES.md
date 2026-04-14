# Incentives Adapter Guidelines

These guidelines apply to all adapters in the `incentives/` directory.

## What are Incentives?

Incentives are token emissions, rewards, and distributions that are NOT fees. They represent protocol costs, not user-paid fees.

## Key Distinction: Incentives vs Fees

| Incentives | Fees |
|------------|------|
| Block rewards | Transaction fees |
| Liquidity mining emissions | Swap fees |
| Staking rewards (from emissions) | Borrow interest |
| Airdrops | Liquidation fees |
| DAO grants | Protocol fees |

## Important Rule

**Block rewards are INCENTIVES, not fees.**

For chain adapters, only transaction fees paid by users should be tracked as fees. Block rewards are a cost to the network and should be tracked as incentives.

## Dimensions

| Dimension | Description |
|-----------|-------------|
| `dailyTokenIncentives` | Token emissions distributed as incentives |
| `dailyIncentives` | Total incentive value (if applicable) |

## Example Implementation

```typescript
const fetch = async (options: FetchOptions) => {
  const dailyTokenIncentives = options.createBalances();
  
  const logs = await options.getLogs({
    target: REWARDS_CONTRACT,
    eventAbi: 'event RewardPaid(address user, uint256 reward)'
  });
  
  logs.forEach(log => {
    dailyTokenIncentives.add(REWARD_TOKEN, log.reward);
  });
  
  return { dailyTokenIncentives };
};
```

## Fees/Revenue Tracking

If this adapter returns fee/revenue dimensions, follow the guidelines in `fees/GUIDELINES.md`.

## Common Mistakes to Avoid

1. Counting incentives as fees
2. Counting fees as incentives
3. Double-counting with fee adapters
4. Not distinguishing between emission types
