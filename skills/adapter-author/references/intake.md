# Intake

Use after the broad opener in `SKILL.md` when facts are still missing. One unresolved question at a time. Lock each answer before dependent decisions. Read the repo before asking.

## Evidence to inspect first

- `pull_request_template.md` - TVL belongs in `DefiLlama-Adapters`; listing metadata in `defillama-server`; normal adapter PRs do not edit package files.
- `GUIDELINES.md` and the matching category `GUIDELINES.md` - global rules, v1/v2 guidance, fee/revenue model, common traps.
- `adapters/types.ts` - supported `AdapterType`s, `whitelistedDimensionKeys`, the actual metric keys runtime accepts (e.g. `tokenIncentives`, not `dailyTokenIncentives`).
- `.github/workflows/getFileList.js` - PR CI changed-file roots; factory-backed roots are not all covered.
- `factory/registry.ts` - factory-backed adapter wiring and helper fallback.

## Core facts

- protocol name as it should appear on DefiLlama
- whether this is a new listing, a new dimension on an existing listing, or a focused fix
- requested dashboard or metric
- chain or chains
- contracts, routers, vaults, factories, markets, event names, API endpoints, subgraphs, Dune/Allium queries, indexer source
- start date or deployment block per chain
- existing DefiLlama listing and related adapters, if any
- public docs, source code, explorer links, dashboards, website, X/Twitter

## Repo-fit routing (stop and route)

- TVL of any kind (staked, pool2, borrowed, treasury) -> `DefiLlama-Adapters`.
- Logo, category, description, socials, treasury list, audit list, token id, oracle source -> `defillama-server`.
- Liquidations with no local repo precedent -> ask maintainers.
- Metric not in `whitelistedDimensionKeys` -> ask maintainers.
- `aggregator-options` -> ask maintainers (folder exists, wiring does not).

## Confirm metric semantics, not just the label

- Fees: what users pay, and from where (tx fee, borrow interest, trading fee, settlement, gas).
- Revenue: what the protocol keeps; treasury vs holders vs supply-side splits.
- Incentives: token emissions, rewards, block rewards, or grants - not user-paid fees.
- DEX/perps volume: actual traded notional, taker side only.
- Aggregator volume: routed through the aggregator, never the underlying venue.
- Bridge-aggregator volume: value bridged, not fees and not in-chain swaps.
- Options: notional and premium tracked separately, never confused.
- Open interest: end-of-period outstanding notional.
- Users: unique users vs new users vs transactions vs gas paid.

## Source-quality preference

1. on-chain logs or contract calls.
2. maintained subgraphs or DefiLlama indexer data.
3. Dune/Allium/query engines for complex reconstruction.
4. protocol APIs only when (a) it is the only practical source or (b) repo precedent backs it.

If an API only returns current/trailing values, require an explicit reason for `runAtCurrTime`.

## PR metadata

For a new listing, gather what `pull_request_template.md` asks for. For focused fixes, write a concise reason and details - do not invent listing fields.
