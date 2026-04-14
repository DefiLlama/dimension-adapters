# DefiLlama Dimension Adapters - Global Guidelines

These guidelines apply to ALL adapters in this repository.

## PR Description

- Always provide Website and twitter links in the description

## Code Structure

- Use on-chain data/event logs where possible. We are stricter about on-chain for chains where we maintain our own indexer, or where there is significant volume/fees, or where you suspect wash trading
- Use `pullHourly: true`, wherever evm logs and allium queries are used to avoid recomputing data for the same time period and provide more granular data
- Never swallow errors silently. For recoverable chain-specific failures, return 0 and log the error so the adapter continues for other chains. For system-level or critical errors, throw/propagate to fail fast
- Use/add helper code when multiple adapters use similar logic - check `helpers/` folder first
- Do NOT add npm dependencies - this leads to bloat
- Use `api.multiCall` where possible, avoid `Promise.all`. Use PromisePool for non-EVM calls
- Return token breakdown where possible - always include `methodology` and `breakdownMethodology`

## Adapter Version

| | Version 2 | Version 1 |
|---|---|---|
| **Use when** | On-chain logs, contract calls, subgraphs, Dune queries with timestamp filters | External API that only returns daily aggregates |
| **Fetch signature** | `(options: FetchOptions)` | `(timestamp, chainBlocks, options)` |
| **Time range** | Arbitrary start/end timestamps | Fixed day (00:00–23:59 UTC) |
| **`pullHourly`** | Supported | Not supported |
| **Preference** | Always prefer this | Use only when v2 is not possible |

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

## Watch For

- Wash trading - be vigilant especially on low-fee chains
- Incorrect fee/revenue classification
- Missing breakdown labels
- Hardcoded values that should be dynamic
- Double-counting (e.g., both taker and maker volume in perps)
