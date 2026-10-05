# Bridge Adapter Guidelines

These guidelines apply to all adapters in the `bridges/` directory. A bridge adapter tracks the value a bridge moves between chains. Bridge aggregators (routers that pick among several bridges) belong in `bridge-aggregators/`, not here.

## Where a bridge goes

Decide this first:

- **Pure configuration** (deposit/withdrawal events read with `getLogs`, and/or ERC20 transfers in and out of escrow wallets): ONE entry in `factory/evmBridges.ts`, never a standalone file. The factory is backed by `helpers/bridges/`, which adapters do not import directly.
- **Anything else** (tx or receipt lookups, input-data decoding, an API source, a non-EVM leg): a standalone `bridges/<slug>.ts` with its own `fetch`, written in plain repo style and returning the four dimensions below.

## Dimensions

Only the four directional metrics are returned by adapters. Everything else is derived server-side.

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyOutgoingVolume` | YES | USD value deposited into the bridge on the chain, i.e. value leaving that chain |
| `dailyIncomingVolume` | YES | USD value withdrawn from the bridge on the chain, i.e. value arriving on that chain |
| `dailyOutgoingTxCount` | YES | Number of deposits on the chain |
| `dailyIncomingTxCount` | YES | Number of withdrawals on the chain |

Derived when records are read, never returned by an adapter:

- Aggregated volume: incoming plus outgoing per chain; at protocol level the sum of outgoing across chains, which counts every transfer exactly once.
- Tx count: same construction with counts.
- Netflow per chain: incoming minus outgoing. Adapters never return signed values.

## How a transfer is counted

A transfer from chain A to chain B is outgoing on A and incoming on B. It is never counted twice within a single metric: summing `dailyOutgoingVolume` across all chains gives the bridge's total transfer volume.

- Export every chain where the bridge has observable deposit or withdrawal events, one chain per key, each chain's `fetch` reading only its own events.
- Do not add the incoming and outgoing legs together inside the adapter.
- Never infer a destination chain's volume inside the adapter. Record only what is observed.

## One-sided bridges

Canonical L2 bridges and similar designs only emit events on one chain (usually Ethereum). The adapter records that chain alone: deposits into the bridge are outgoing, withdrawals finalized there are incoming. The destination chain's leg (incoming equals the source's deposits, outgoing equals the source's withdrawals) is attributed server-side from the bridge's declared destination chain in its listing config, the same way the old bridges API inverted rows at query time. Name the destination chain in the PR body so the listing config can carry it.

## Data sources

1. On-chain event logs via `options.getLogs` with a readable `eventAbi` and explicit `targets`. Preferred for every EVM chain.
2. DefiLlama indexer / Allium / Dune when logs are impractical.
3. The bridge's own API with full history, only when the above are impossible. An API that returns pre-priced USD amounts goes through `addUSDValue`.

Log-based adapters are `version: 2` with `pullHourly: true`. Use `version: 1` only when the source serves daily aggregates. Never a 24h-only API.

## Pricing and units

- Add token amounts with `balances.add(token, rawAmount)` so the window price is used. Never scale a USD column by token decimals.
- Skip events with a zero address or missing sender/receiver.
- Do not assume a token is USD-pegged.

## Methodology keys

`methodology` keys are display names: `OutgoingVolume`, `IncomingVolume`, `OutgoingTxCount`, `IncomingTxCount`. Say in plain English what counts as a deposit and a withdrawal for this bridge.

## Testing

```bash
npm run test bridges <adapter-name>             # current window
npm run test bridges <adapter-name> 2024-03-11   # a specific date (end of window)
```

Compare several past days against the bridge's own explorer or dashboard. Incoming and outgoing summed across all chains should be close to each other for a two-leg bridge; a large gap means a missing chain or a misclassified event.

## Common mistakes

1. Returning `dailyAggregatedVolume`, `dailyTxCount` or a netflow from the adapter. They are derived.
2. Adding both legs of a transfer into the same metric.
3. Tracking only the source chain of a two-leg bridge, which leaves the destination chains with no incoming volume.
4. Counting the bridge's internal rebalancing or liquidity-provider deposits as user transfers.
5. Counting failed or refunded transfers.
