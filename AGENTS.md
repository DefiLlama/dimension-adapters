# DefiLlama Dimension Adapters - Global Guidelines

These guidelines apply to ALL adapters in this repository.

## PR Description

- Always provide Website and twitter links in the description
- Pre-answer the questions every review asks: is a 0-volume/0-fee day correct for this protocol? Why do the numbers differ from the protocol's own dashboard? Did the fee rate or split ever change, and when? Is this related to an existing listing or an open PR? Does the fee-to-volume ratio make sense? If this changes an existing adapter, is a refill needed and from which date?
- `skills/adapter-author/references/validation.md` and `patterns.md` hold the authoring checklist (metric keys, category routing). A PR that fails it fails review.

## Code Structure

- Use on-chain data/event logs where possible. We are stricter about on-chain for chains where we maintain our own indexer, or where there is significant volume/fees, or where you suspect wash trading. EVM chains can almost always be tracked with on-chain logs - prefer logs over a protocol API
- Use `pullHourly: true`, wherever evm logs and allium queries are used to avoid recomputing data for the same time period and provide more granular data
- Never swallow errors silently. For recoverable chain-specific failures, return 0 and log the error so the adapter continues for other chains. For system-level or critical errors, throw/propagate to fail fast. Do NOT wrap adapter logic in `try/catch` just to ignore errors - either remove the catch or `throw` inside it
- Use/add helper code when multiple adapters use similar logic - check `helpers/` folder first
- Do NOT add npm dependencies - this leads to bloat
- Do NOT add new `.js` files - all new adapters and helpers must be written in TypeScript (`.ts`). PRs that add `.js` files should be rejected
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

Open interest is currently exported for perps and futures only. Options adapters do not export it yet: raw notional OI is not comparable across expiries and strikes, and a measure normalized for time to expiry and distance from the current price is still to be defined.

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

## Testing an adapter locally

```bash
npm run test <type> <slug> [YYYY-MM-DD] [chain1,chain2]
```

- The bare slug resolves both file-based adapters (`<type>/<slug>.ts` or `<type>/<slug>/index.ts`) and factory-listed keys (e.g. a key in `factory/uniV3.ts`).
- The date argument is the END of the window: to reproduce day D, pass D+1. The optional last argument limits the run to those chains.
- For a fix to a live adapter also read the published series: `https://api.llama.fi/summary/<type>/<slug>?dataType=<dimension>`, once per required dimension of the category (`dailyVolume`; `dailyFees` and `dailyRevenue`; `dailyBridgeVolume`; `dailyNotionalVolume` and `dailyPremiumVolume`; `openInterestAtEnd`). A series ending in a null `total24h` means the adapter throws. For flow metrics a hard $0 after big days with no taper means source lag, not zero activity. Snapshot metrics (open interest) are judged by the end-of-window value: 0 is valid only when no positions remain, a drop to 0 while the venue still has open positions is a bug.
- `DEBUG_BREAKDOWN_FEES=true npm run test fees <slug> <date>` prints the per-label breakdown table.
- `balances.debug()` inside a fetch prints the largest token values and addresses (useful for decimals/pricing problems).
- Run several random past days, not just one. Zeros on random days with known activity, or values an order of magnitude off the protocol's own UI/explorer/Dune, block the listing until explained. CI proves little: forked PRs get no Dune keys and public RPCs may be non-archival, so a local run is the real check.

## Where a new adapter goes

The wrong vehicle is a blocker, decide this first:

| Protocol kind | Where |
|---|---|
| Uniswap v2/v3 fork, Algebra fork, standard subgraph DEX | ONE config entry in `factory/uniV2.ts` / `factory/uniV3.ts` / `factory/uniSubgraph.ts`, never a standalone file (see `dexs/AGENTS.md`) |
| Compound v2 fork | `factory/compoundV2.ts` (fees and liquidations derive from the same entry) |
| Aave fork liquidations | `factory/aaveLiquidations.ts` (derived from the fee config) |
| Chain-level native fees | config entry first: `helpers/evmChainFees.ts` (plain EVM RPC), `factory/routescan.ts`, `factory/blockscout.ts`; a standalone `fees/<chain>.ts` with `protocolType: ProtocolType.CHAIN` only when no factory fits |
| Vault curator (Morpho/Euler owners) | `factory/curators.ts` |
| Hyperliquid builder code | one entry in `factory/hyperliquid.ts` (volume and fees are both derived from it) |
| Normalized perp volume | one entry in `factory/normalizedVolume.ts` |
| Active/new users, tx count | `active-users/<slug>.ts`, `new-users/<slug>.ts`; for chains check `users/chains.ts` config paths first |
| Anything genuinely custom | `<type>/<slug>.ts` |

- Grep the protocol name AND slug across all type folders, `factory/*.ts` and `factory/deadAdapters.json` before adding anything. An existing adapter for the same metric is a duplicate (closed, not fixed); if a factory entry already exists, extend it (add the chain) instead of adding a second key.
- `factory/registry.ts` is not edited, factories auto-expose their configs.
- Fee ratios in factory entries come from the protocol's documented split only; omit the ratio fields rather than guess (volume still works without them).
- New chain: add a `CHAIN` enum member in `helpers/chains.ts` (string value = the DefiLlama chain slug, match neighbours' casing/order); a dedicated RPC goes in `DEFAULTS` in `helpers/env.ts`. Add chain support together with the protocol that needs it; config no live adapter consumes is rejected.
- Fully off-chain venues get their own chain key (or `off_chain`), never the host EVM chain.
- Pool/yield additions belong in `DefiLlama/yield-server`; token emission schedules belong in `DefiLlama/emissions-adapters`, not here.

## Naming, identity and listings

- The folder/file name IS the listing slug: kebab-case, lowercase (an uppercase folder once broke the pipeline). Versioned deployments get `-v2`/`-v3` suffixed keys. Separate listing per product or version (spot vs perp, v2 vs v3).
- When `x.ts` and `x/index.ts` both exist the `.ts` wins, so never keep both.
- One protocol maps to one fees file; versions stay separate listings, and counting legacy pools inside the current adapter double counts the legacy listing. When a chain gets a standalone fee adapter, drop its blockscout/routescan factory entry.
- A single pool or hook is not a protocol. List only chains with real activity; hundreds of chains with zero cumulative volume is not a feature.
- Hyperliquid builder codes: verify the address belongs to the claimed protocol before listing it.
- Never rename adapter files/folders or chain keys, never delete adapters, chains or history: they are the link to the listing and its stored data.
- Listing prerequisites: website, X/Twitter and docs in the PR body, and a priceable token/asset (on CoinGecko with real liquidity) where pricing is needed. Do not edit `coreAssets.json` (it is a whitelisted pricing-token list, not an address book).
- The server-side wiring (`dimensions: { <type>: "<slug>" }` in defillama-server) is a separate follow-up: name it in the PR body so it can be done after merge.

## Adapter mechanics

- `start` and `deadFrom` are `'YYYY-MM-DD'` strings. `start` is the earliest date that ACTUALLY returns data. A failing old date is a bug to fix, not a reason to move `start` later. If the start cannot be determined, omit it rather than guess.
- `runAtCurrTime: true` only when history is genuinely impossible (then no `start`); remove it as soon as the source supports history. Verify that a project API actually honours its from/to params. An API that ignores `end` and only serves today/yesterday buckets gets throw-on-null for other dates (the day is recorded as missing), NOT `runAtCurrTime`, which would store the partial running total. If the team's API back-fills during the day, say so in the PR: the adapter can be delayed server-side by a few hours.
- Rate-based fees scale by `toTimestamp - fromTimestamp`, never an assumed 86400.
- Missing data must THROW, never return 0/empty silently: the refill job caches whatever the adapter returns. Single-row daily Dune/Allium sources throw when the row is missing or the metric is null; `COALESCE(..., 0)` or `Number(row?.x) || 0` turns ingestion lag into a stored $0. Sources with a publication delay must throw inside the delay window; stale data is never presented as the current day.
- `dependencies: [Dependencies.DUNE]` (or `ALLIUM`) when the adapter queries the warehouse.
- One simple adapter per listing; avoid multi-adapter breakdown wrappers, they make refills nearly impossible.
- `.clone()` a balances object when you need the same amounts in two exports; never add the same instance to two exports.
- `doublecounted: true` when an underlying tracked protocol already counts the flow (Uniswap v4 hooks, builder codes).
- `cacheInCloud: true` only for small, slowly-changing config scans (pool-created lists), never for per-window event data.
- No adapter-level scheduling or refill configuration (reconcile windows, run delays): that lives server-side.
- Never edit `package.json`, lockfiles, `.github/`, `adapters/types.ts`, `cli/buildModules.ts` or `factory/registry.ts` in an adapter PR.
- Time filters are half-open: `>= options.startTimestamp AND < options.endTimestamp` on the block time. `<=` double counts the boundary second.
- Stock metrics (open interest, TVL-like snapshots) are read once at the window end. Summing them across hourly pulls inflates them 24x.
- `options.getLogs` returns decoded args only. When `blockNumber`, `logIndex`, `txHash` or the emitter matter, pass `onlyArgs: false` or use `getPositionedLogArgs` from `helpers/logs.ts`.
- `permitFailure: true` on calls to pools known to exist hides RPC errors as zeros; do not use it as a convenience.
- `Number(bigint) / 1e18` loses precision past 2^53. Keep amounts as strings/BigInt into the balances object.
- Chain parity: every chain in the volume adapter has a fee leg and vice versa, or the gap is stated in the adapter.
- When an API is the accepted source, keep the on-chain fee wallets, logger contracts or program ids as comments next to the code so the adapter can be rebuilt if the API disappears.

## Data source rules

- No number beats a wrong number: if a value cannot be verified (ideally on-chain), track only the verifiable slice. Reported-only APIs with no trade-level data are not listed.
- Preference order: on-chain event logs > DefiLlama indexer > Dune/Allium > project API with history > 24h-only API with `runAtCurrTime` (last resort). Never a blackbox API that cannot refill an arbitrary past day. On chains with unreliable RPCs, ask for an aggregated daily endpoint rather than a `getLogs` adapter that cannot complete.
- Verify that the event you pass to `getLogs` exists on the deployed contract's verified source. A `getLogs` on a non-existent event signature returns zero and passes CI.
- Check the unit of every source column: a value already in USD goes through `addUSDValue`, never scaled by token decimals.
- Use point-in-time lookups (as of the window end) for supplies and balances, never current-state reads, so refills reproduce history.
- Prefer dynamic on-chain/API discovery of pools and markets over hardcoded static lists; a static list cites its maintained source inline.
- No estimates: no fee-tier assumptions, no APY-derived fees, no fixed rate where tiers exist, never fees derived from a yield API. Read fee rates and treasury addresses from the contract where possible.
- Pricing: prefer the source's own USD values summed in-query, or count the known/major token side of a trade, over pricing long-tail tokens; blacklist mispriced tokens. Never assume a token is USD-pegged: allowlist verified pegs explicitly and skip unknown pools.
- Fee-wallet tracking: exclude transfers between the protocol's own wallets; on mixed-use wallets scope with `fromAddresses` (verified payer/router contracts) and comment each address's role with a sample tx. EOA-to-EOA transfers count only with verified provenance.
- Solana: attribute transfers at the instruction level (emitting program), never by tx id alone; batched unrelated transfers over-count. Prefer Dune/Allium over raw RPC signature scanning.
- Identify a protocol's pools/configs by its OWN authority (fee claimer, deployer, factory), never by quote token: third parties can create look-alike configs before the protocol launches. Router/pool discovery from the protocol's own events beats a stale hardcoded list once the emitter's provenance is proven.
- Governance-set rates read at the window's opening block are acceptable when changes are rare; replaying in-window rate-change events ordered by (blockNumber, logIndex) is exact.
- Cumulative-counter sources need the closing snapshot too: 25 hourly points bound 24 intervals, dropping the last one loses 4-5% a day.
- Self-reported APIs from privacy ledgers are accepted for VOLUME only, with a sample settlement id; fees are dropped rather than estimated.
- Never source metrics from a competitor's website, only the protocol's own endpoints or on-chain data. Credit external dashboards/query authors as the source in the adapter.
- Never shift a query window into the future to match an external reporting cycle: the runner queries today and future windows find nothing.
- Dune: raw SQL inline (no `DUNE_QUERY_ID`), never a committed API key, return only the requested day's aggregate (billing is per row, never full history), keep nested subqueries within ~3 levels, and build in a delay for Solana indexing lag. A query that hits Dune's 30 minute timeout is rejected.

## getLogs performance

- Hundreds of targets is the sanctioned exception to `targets`: fetching all logs by `topic0` and filtering client-side is more efficient there (the indexer caps no-target queries at 10k-block ranges).
- The number of `getLogs` calls per run is a budget: one call with `targets` beats one call per pool. Avoid `streamLogs`; avoid per-event RPC calls and full-block scans; do not raise public-RPC pressure (slow but un-rate-limited wins). An adapter that 429s in CI is blocked: remove request concurrency first, then ask the team for better endpoints.

## Maintaining existing adapters

- **Dead protocol**: `deadFrom: 'YYYY-MM-DD'` top-level (sibling of `version`/`fetch`/`chains`) with a `// reason` comment, on every adapter file of the protocol. Keep the fetch logic, `start` and chains so history stays refillable. Long-dead adapters are later swept into `factory/deadAdapters.json` (file deleted, slug recorded), so a "missing" adapter may live there.
- `deadFrom` on the adapter is global. To end a single chain going forward, set `deadFrom` on that chain's config entry: the runner skips the chain before calling `fetch`, so nothing is stored (this is also the fix for a frozen or sunset RPC that would otherwise throw and take every other chain down). Do not return an empty result from `fetch` as a shutdown mechanism, it is still recorded as a row; if a date guard is needed inside `fetch`, throw past it. To end a chain retroactively, comment it out and refill. Never store empty or zero rows.
- An optional enrichment call (an L1 cost lookup, a price read) in the same `Promise.all` as the required metric takes both down. Catch the optional call, publish the metric and OMIT the derived value rather than publishing it uncorrected.
- When a source breaks but the protocol is alive, the fix is another source, never `deadFrom` and never a zero fallback. Fees dropping to 0 with healthy TVL usually means a changed fee address, not a dead protocol.
- **Disable a chain**: comment the entry out in place with a reason everywhere it appears (config, chains array, per-chain map); never delete.
- **Retiring an old endpoint must not shrink history**: run an old date on both versions; new code returning 0 where the old had values blocks until the new source is backfilled.
- **Migrations and behaviour changes**: any change without a time guard silently overwrites correct history on the next refill. Contract/API migrations use date-based switching with `start` unchanged; a fee-rate change needs its date and a timestamp condition.
- **Labels**: changing an existing breakdown label string forces a full history refill, keep them. Whoever changes values or labels refills history; never refill to a team's retroactively sanitised numbers.
- Every mitigation/toggle carries a short factual reason comment. Minimal diff, match the file's formatting.

## Writing `methodology` and `breakdownMethodology` text

- `methodology`: one plain-English sentence per metric key, written for an end user with zero context. Name where the money comes from, not the mechanism. State known exclusions explicitly ("excludes the HLP vault and HyperEVM fees"). Human-readable names, not `CONSTANT_CASE`.
- Name fee types precisely: a percentage taken on yield earned is a performance fee, not a management fee.
- State split changes with their date in one sentence ("15% to treasury since September 2025, 0% before"). Numbers and percentages come from the code or the protocol's docs, never from memory.
- The label check is bidirectional: every `.add()`/`.addUSDValue()` label appears in `breakdownMethodology` under each metric it flows into (same spelling), and every entry there has code emitting it.

## Wash and fake volume

- Wash volume comes OUT of volume; fees genuinely paid to a real party may stay in fees. Incentive-farming volume is excluded even when the trades are real.
- Surgical removal only (specific pairs/pools/senders/txs, then structural filters, then temporarily hiding one chain with a reason); never drop a whole protocol when part of the volume is real. A hard cap is a last resort and its rationale must be a code comment.
- Keep detection heuristics out of PR text and public docs (filters get circumvented). If you cannot tell organic from fake with the information at hand, say what evidence is needed; a wrong filter is worse than none.
- Self-trading = participants taking no real profit or loss. Arb and strategy bots paying real fees are legitimate. An implausible volume-to-OI or volume-to-TVL ratio is the strongest single wash signal.
- Genuine spikes (airdrop, launch, depeg, market event, first buyback day, migration) are whitelisted server-side, not smoothed in the adapter. Exploit-day fees/volume are excluded, not whitelisted.
