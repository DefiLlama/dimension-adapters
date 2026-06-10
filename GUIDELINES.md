# DefiLlama Dimension Adapters - Global Guidelines

These guidelines apply to ALL adapters in this repository.

## PR Description

- Always provide Website and twitter links in the description

## Code Structure

- Use on-chain data/event logs where possible. We are stricter about on-chain for chains where we maintain our own indexer, or where there is significant volume/fees, or where you suspect wash trading. EVM chains can almost always be tracked with on-chain logs - prefer logs over a protocol API
- Use `pullHourly: true`, wherever evm logs and allium queries are used to avoid recomputing data for the same time period and provide more granular data
- Never swallow errors silently. For recoverable chain-specific failures, return 0 and log the error so the adapter continues for other chains. For system-level or critical errors, throw/propagate to fail fast. Do NOT wrap adapter logic in `try/catch` just to ignore errors - either remove the catch or `throw` inside it
- Use/add helper code when multiple adapters use similar logic - check `helpers/` folder first
- Do NOT add npm dependencies - this leads to bloat
- Use `api.multiCall` where possible, avoid `Promise.all`. Use PromisePool for non-EVM calls
- Return token breakdown where possible - always include `methodology` and `breakdownMethodology`

### Fetch signature - always `(options)`

- The `fetch` function takes a single `FetchOptions` argument for **both** v1 and v2: `const fetch = async (options: FetchOptions) => { ... }`
- The old v1 3-argument signature `(timestamp, chainBlocks, options)` no longer exists and will fail - never use it. Migrate any adapter still using it to `(options)`.
- Use the values already on `options` instead of deriving them from a raw timestamp: `options.startOfDay`, `options.dateString`, `options.startTimestamp`, `options.endTimestamp`, `options.fromTimestamp`, `options.toTimestamp`, `options.getFromBlock()`, `options.getToBlock()`
- Do NOT declare fetch arguments you never use
- `fetch` should NOT return `timestamp` in its result - for v1 and v2 alike. Just return the dimension balances.

### getLogs / event handling

- Pass `getLogs({ targets: [...] })` with the full list of contracts instead of using `noTarget` and filtering afterwards - `noTarget` scans every log on the chain and is very heavy
- Use a human-readable `eventAbi` instead of raw `topics` - easier to review and maintain
- When matching trades to fee transfers, do NOT assume they share the same transaction hash - many protocols emit the fee transfer in a separate tx

### Constants & rates

- Add a comment (and a source link where possible) for any hardcoded rate, address, or magic number so maintainers can verify it later
- Express rates in a clear, self-documenting way (e.g. `0.1` for a 10% fee), not opaque expressions
- `allowNegativeValue` must be justified with an inline comment explaining why negatives are expected

## Adapter Version

| | Version 2 | Version 1 |
|---|---|---|
| **Use when** | On-chain logs, contract calls, subgraphs, Dune queries with timestamp filters | External API that only returns daily aggregates |
| **Fetch signature** | `(options: FetchOptions)` | `(options: FetchOptions)` (same as v2 - the old 3-arg signature is removed) |
| **Time range** | Arbitrary start/end timestamps | Fixed day (00:00–23:59 UTC) |
| **`pullHourly`** | Required - set explicitly (`true` by default, `false` + reason if not possible) | Not supported |
| **Preference** | Always prefer this | Use only when v2 is not possible |

### Version Rules

- **Dune adapters must always be `version: 1`.** Dune queries run once per day; a v2 adapter runs every hour and would re-run the same expensive query each hour.
- For v2 adapters, drive time windows off `options.startTimestamp`/`options.fromTimestamp` (and `options.getFromBlock()`), NOT `options.startOfDay`. Because v2 runs hourly, keying off start-of-day sends the same request every hour and breaks granular/hourly data.
- New adapters must be `version: 2` unless they rely on Dune or on an external API that only returns daily aggregates.
- **Every `version: 2` adapter must explicitly set the `pullHourly` key.** Default to `pullHourly: true`. Only set `pullHourly: false` when the data genuinely cannot be pulled hourly, and add a comment explaining why.

### Dune query rules

- Do NOT add extra/duplicate date filters - the `TIME_RANGE` macro already injects the date filter. Duplicates make queries slower and can conflict.
- Keep queries as optimal as possible; for multi-chain protocols use a single prefetch query covering all chains rather than one query per chain.
- Share the Dune run/test results in the PR so reviewers can validate (queries that only time out on long runs are not acceptable).

### Adapter shape: `chains` vs `adapter` vs `chainConfig`

Pick the simplest shape that fits. In order of preference:

**1. Same `start` for all chains → use the `chains` array + a single `start`:**

```typescript
const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.BASE, CHAIN.ARBITRUM],
  start: '2023-01-01',
  methodology,
}
```

**2. Different `start` per chain (but no other per-chain config) → use the `adapter` object:**

```typescript
const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: {
    [CHAIN.ETHEREUM]: { start: '2023-01-01' },
    [CHAIN.BASE]: { start: '2024-06-01' },
  },
  methodology,
}
```

**3. Per-chain config (different contract/id/etc.) → keep it all in one `chainConfig` and pass it as `adapter: chainConfig`.** Each entry carries a `start` plus whatever else the chain needs; `fetch` reads `chainConfig[options.chain]`. This avoids a separate chains list, start map, and config map drifting apart:

```typescript
const chainConfig: Record<string, { contract: string; start: string }> = {
  [CHAIN.ETHEREUM]: { contract: '0xaaa...', start: '2023-01-01' },
  [CHAIN.BASE]:     { contract: '0xbbb...', start: '2024-06-01' },
}

const fetch = async (options: FetchOptions) => {
  const { contract } = chainConfig[options.chain]
  const dailyFees = options.createBalances()
  const logs = await options.getLogs({ target: contract, eventAbi: '...' })
  // ...
  return { dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: chainConfig, // start dates are read from chainConfig per chain
  methodology,
}
```

## Core Dimensions by Dashboard

### DEXs and DEX Aggregators

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyVolume` | YES | Trading volume for the period |

### Derivatives and Aggregator-Derivatives

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyVolume` | YES | Perpetual trading volume (TAKER volume only, do NOT double-count maker+taker) |
| `openInterestAtEnd` | Optional | Open interest at period end |
| `longOpenInterestAtEnd` | Optional | Long positions open interest |
| `shortOpenInterestAtEnd` | Optional | Short positions open interest |

### Bridge Aggregators

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyBridgeVolume` | YES | Bridge volume for the period |

### Options

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyNotionalVolume` | YES | Notional volume of options contracts |
| `dailyPremiumVolume` | YES | Premium volume collected/paid |
| `openInterestAtEnd` | Optional | Open interest at period end |

### Fees (Income Statement Model)

| Dimension | Required | Description |
|-----------|----------|-------------|
| `dailyFees` | YES | All fees from ALL sources (Gross Protocol Revenue) - everything protocol could theoretically keep if it took 100% |
| `dailyRevenue` | YES | Portion kept by protocol (Gross Profit = dailyFees - dailySupplySideRevenue) |
| `dailySupplySideRevenue` | When applicable | Portion to LPs, lenders, stakers, integrators, referrers, creators (Cost of Revenue) |
| `dailyUserFees` | Optional | Portion directly paid by end-users |
| `dailyProtocolRevenue` | Optional | Portion allocated to treasury |
| `dailyHoldersRevenue` | When applicable | All value to token holders (buybacks, burns, distributions, external airdrops, bribes) |

## Minimum Requirements for Listing

- **Must provide** all required dimensions for the adapter category (see tables above)
- **For fees adapters**: must provide accurate `dailyFees` and `dailyRevenue`
- **Strongly encouraged**: `dailySupplySideRevenue` when protocol has supply-side costs
- **Include when applicable**: `dailyHoldersRevenue` for protocols distributing to holders
- **Always include**: breakdown labels and `breakdownMethodology`
- **Deprecated**: `total*` cumulative dimensions - do not use

## Income Statement Mapping

| Display Name | Code Field |
|--------------|------------|
| Gross Protocol Revenue | dailyFees |
| Cost of Funds | dailySupplySideRevenue |
| Gross Profit | dailyRevenue |
| Tokenholder Income | dailyHoldersRevenue |

## Fee/Revenue Attribution by Protocol Type

| Attribute | DEXs | Lending | Chains | NFT Marketplace | Derivatives | CDP | Liquid Staking | Yield |
|-----------|------|---------|--------|-----------------|-------------|-----|----------------|-------|
| Fees | Swap fees | Borrow interest | Gas fees | Trading fees | Trading fees + mint/burn | Borrow fees | Staking rewards | Yield |
| SupplySideRevenue | LP revenue | Interest to lenders | Sequencer costs, blob fees | Creator earnings | LP revenue, rebates | N/A | Rewards to stakers | Yield minus fees |
| Revenue | Protocol's % | Protocol's % | Burned fees | Marketplace rev | Protocol's % | Protocol's % | Protocol fee % | Protocol fees |
| HoldersRevenue | Token distributions | N/A | N/A | N/A | Staker distributions | N/A | N/A | N/A |

**Notes:**
- `Revenue = Fees - SupplySideRevenue`
- `Revenue = HoldersRevenue + ProtocolRevenue`
- For chains: only track transaction fees paid by users. Perp DEX fees (e.g., Hyperliquid L1) are tracked under the perp adapter, not chain adapter

## Breakdown Labels

- ALWAYS provide labels even when there is only one source/destination of fees
- Labels prevent needing to update and backfill data when adapter is listed under a parent protocol
- `dailyFees`: Use source-of-fees labels (e.g., 'Swap Fees', 'Borrow Interest')
- `dailyRevenue`/`dailySupplySideRevenue`/`dailyHoldersRevenue`: Use detailed destination labels (e.g., 'Swap Fees To LPs', 'Borrow Interest To Treasury')

**Every label used in `.add()` calls MUST appear in `breakdownMethodology`**, and every label in `breakdownMethodology` must have corresponding data in code.

## Deprecated Fields

- `dailyBribesRevenue` and `dailyTokenTaxes` are deprecated; put these as sub-sections within `dailyHoldersRevenue` instead

## Data Classification Rules

- **Fees**: Only fees paid by users for transactions should be tracked as fees. Block rewards are incentives, NOT fees
- **Revenue**: Only the portion that gets burnt or goes to protocol treasury. Staker payments are NOT revenue
- **Holder Revenue**: Same as revenue unless portion is set aside for protocol
- **Chain Fees**: Track only transaction fees paid by users (no perp DEX fees for chains like Hyperliquid L1)

## Guiding Principle

'Gross Protocol Revenue' (dailyFees) should include everything the protocol COULD charge if it became maximally greedy.

Example: For Aave, if depositors get 70% and protocol gets 30% of borrow fees, dailyFees includes 100% because protocol could theoretically take it all.

## `methodology` keys

- Keys in the `methodology` object must match dimension display names, NOT the code field names: use `Fees`, `Revenue`, `SupplySideRevenue`, `ProtocolRevenue`, `HoldersRevenue`, `Volume`, `NotionalVolume`, `PremiumVolume`, `OpenInterest` - e.g. `dailyVolume` -> `Volume`, `dailyFees` -> `Fees`.

## Watch For

These are the issues that come up most often in review - check every PR for them:

- Wash trading - be vigilant especially on low-fee chains
- Incorrect fee/revenue classification, and `Fees = Revenue + SupplySideRevenue` not balancing within a period (note: `Revenue = ProtocolRevenue + HoldersRevenue` is an attribution rule, not a per-day equality - holders revenue like buybacks can land on a different day)
- Counting ALL fees as revenue (forgetting the supply-side cut)
- Missing `dailyProtocolRevenue`/`dailyHoldersRevenue` split when the protocol keeps some and distributes some
- Unexpected negative `dailySupplySideRevenue` - worth a look, but can be legitimate on realized vault losses; verify rather than assume a bug
- Missing breakdown labels or `breakdownMethodology`, or labels that don't match the methodology
- Hardcoded values that should be dynamic; hardcoded rates/addresses without a source comment
- Double-counting (both taker and maker volume in perps; both buy and sell legs; routed volume already counted in the underlying protocol; buybacks already counted in a parent listing)
- Dune adapters not set to `version: 1`, or duplicate Dune date filters
- v2 adapters keying time windows off `startOfDay` instead of `startTimestamp`
- `noTarget` getLogs, raw `topics`, missing `multiCall`, or `try/catch` that swallows errors
- Cumulative data returned where 24h/daily data is expected
