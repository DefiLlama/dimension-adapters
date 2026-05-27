# Helpers Directory Guidelines

These guidelines apply to all code in the `helpers/` directory.

## Purpose

The helpers directory contains shared utility functions used across multiple adapters. Before writing custom logic, check if a helper already exists.

## When to Add a Helper

Add a new helper when:
- Multiple adapters (2+) use the same logic
- The logic is generic and reusable
- It simplifies adapter code significantly

## Available Helpers

### Protocol Helpers

| File | Functions | Use Case |
|------|-----------|----------|
| `uniswap.ts` | `uniV2Exports`, `uniV3Exports`, `getUniV2LogAdapter` | Uniswap V2/V3 style DEXs |
| `compoundV2.ts` | `compoundV2Export` | Compound V2 style lending |
| `aave/index.ts` | `aaveExports` | Aave style lending |
| `liquity.ts` | Liquity helpers | CDP protocols |
| `balancer.ts` | Balancer helpers | Balancer style DEXs |
| `solidly.ts` | Solidly helpers | Solidly/Velodrome style DEXs |
| `gmx.ts` | GMX helpers | GMX style perp DEXs |
| `hyperliquid.ts` | Hyperliquid helpers | Hyperliquid integration |
| `joe.ts` | TraderJoe helpers | TraderJoe V2 |
| `fraxlend.ts` | Fraxlend helpers | Fraxlend style lending |
| `symmio.ts` | Symmio helpers | Symmio perp protocol |

### Token Tracking Helpers

| File | Functions | Use Case |
|------|-----------|----------|
| `token.ts` | `addTokensReceived` | Track ERC20 transfers to addresses |
| `token.ts` | `addGasTokensReceived` | Track native token transfers to multisigs |
| `token.ts` | `getETHReceived` | Track native token via Allium DB |
| `token.ts` | `getSolanaReceived` | Track Solana token transfers |

### Chain & Query Helpers

| File | Functions | Use Case |
|------|-----------|----------|
| `chains.ts` | `CHAIN` constants | All supported chain identifiers |
| `dune.ts` | Dune query helpers | Dune Analytics integration |
| `allium.ts` | Allium query helpers | Allium DB queries |
| `indexer.ts` | `queryIndexer` | DefiLlama indexer queries |
| `getBlock.ts` | Block lookup helpers | Get blocks by timestamp |

### Metrics & Labels

| File | Functions | Use Case |
|------|-----------|----------|
| `metrics.ts` | `METRIC` constants | Standard breakdown labels |

Available METRIC constants:
```typescript
METRIC.BORROW_INTEREST       // 'Borrow Interest'
METRIC.LIQUIDATION_FEES      // 'Liquidation Fees'
METRIC.FLASHLOAN_FEES        // 'Flashloan Fees'
METRIC.SWAP_FEES             // 'Token Swap Fees'
METRIC.LP_FEES               // 'LP Fees'
METRIC.STAKING_REWARDS       // 'Staking Rewards'
METRIC.MEV_REWARDS           // 'MEV Rewards'
METRIC.TOKEN_BUY_BACK        // 'Token Buy Back'
METRIC.CREATOR_FEES          // 'Creator Fees'
METRIC.MARGIN_FEES           // 'Margin Fees'
METRIC.OPEN_CLOSE_FEES       // 'Open/Close Fees'
METRIC.PERFORMANCE_FEES      // 'Performance Fees'
METRIC.MANAGEMENT_FEES       // 'Management Fees'
METRIC.CURATORS_FEES         // 'Curators Fees'
METRIC.OPERATORS_FEES        // 'Operators Fees'
METRIC.TRADING_FEES          // 'Trading Fees'
METRIC.TRANSACTION_GAS_FEES  // 'Transaction Gas Fees'
METRIC.TRANSACTION_BASE_FEES // 'Transaction Base Fees'
METRIC.TRANSACTION_PRIORITY_FEES // 'Transaction Priority Fees'
METRIC.MINT_REDEEM_FEES      // 'Mint/Redeem Fees'
METRIC.DEPOSIT_WITHDRAW_FEES // 'Deposit/Withdraw Fees'
METRIC.SERVICE_FEES          // 'Service Fees'
METRIC.ASSETS_YIELDS         // 'Assets Yields'
METRIC.PROTOCOL_FEES         // 'Protocol Fees'
```

### Chain-Specific Helpers

| File | Functions | Use Case |
|------|-----------|----------|
| `ethereum-l2.ts` | L2 fee helpers | Ethereum L2s (blob fees, etc.) |
| `ethereum-builder.ts` | Builder helpers | MEV/builder revenue |
| `blockscoutFees.ts` | Blockscout queries | Chains using Blockscout |
| `etherscanFees.ts` | Etherscan queries | Chains using Etherscan |
| `aptos.ts` | Aptos helpers | Aptos chain |
| `cardano.ts` | Cardano helpers | Cardano chain |
| `solana.ts` | Solana helpers | Solana chain |
| `sui.ts` | Sui helpers | Sui chain |
| `ripple.ts` | Ripple helpers | XRP Ledger |

### Utility Helpers

| File | Functions | Use Case |
|------|-----------|----------|
| `cache.ts` | Caching utilities | Cache expensive calls |
| `prices.ts` | Price fetching | Get token prices |
| `pool.ts` | Pool utilities | Pool data helpers |
| `lists.ts` | List management | Protocol/chain lists |
| `erc4626.ts` | ERC4626 helpers | Vault standard |

## Usage Examples

### Using Protocol Helpers
```typescript
import { uniV2Exports } from '../helpers/uniswap';
import { compoundV2Export } from '../helpers/compoundV2';
import { CHAIN } from '../helpers/chains';
import { METRIC } from '../helpers/metrics';
```

### Using Token Tracking
```typescript
import { addTokensReceived, getSolanaReceived } from '../helpers/token';

const dailyFees = await addTokensReceived({
  options,
  tokens: [WETH_ADDRESS],
  targets: [TREASURY_ADDRESS]
});
```

### Using Query Helpers
```typescript
// Via options object
const results = await options.queryDuneSql(`SELECT ...`);
const data = await options.queryAllium(`SELECT ...`);

// Via direct import
import { queryIndexer } from '../helpers/indexer';
```

## Code Quality Standards

1. **Type Safety**: All helpers must have proper TypeScript types
2. **Documentation**: Include JSDoc comments for public functions
3. **Error Handling**: Never swallow errors, propagate them
4. **Performance**: Use batching (multiCall) where possible
5. **Testing**: Helpers should work across all chains they support

## Common Mistakes to Avoid

1. Duplicating existing helper functionality
2. Adding npm dependencies (not allowed)
3. Creating helpers for single-use logic
4. Not using api.multiCall for batch operations
5. Hardcoding chain-specific values that should be parameters
6. Not checking existing helpers before writing custom code
