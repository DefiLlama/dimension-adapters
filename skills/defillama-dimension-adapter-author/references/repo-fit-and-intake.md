# Repo Fit and Intake

Use this reference after the first broad context question when important facts are still missing. Ask one unresolved question at a time and lock each answer before moving to dependent decisions.

## Evidence to inspect first

- `pull_request_template.md`: TVL belongs in `DefiLlama-Adapters`; listing metadata updates belong in `defillama-server`; normal adapter PRs should not edit package files.
- `README.md`: install and test commands are `pnpm i` and `pnpm test <type> <adapter> [date]`.
- `GUIDELINES.md`: global dimension rules, v1/v2 guidance, required dimensions, fee/revenue model, and common traps.
- `adapters/types.ts`: supported adapter types and allowed metric keys.
- `.github/workflows/getFileList.js`: PR CI changed-file roots; some factory-backed roots need manual tests.
- `factory/registry.ts`: factory-backed adapters and helper fallback behavior.

## Broad intake question

Start here:

```text
Tell me about the protocol, what you want added or changed on DefiLlama, which dimension you think it belongs to, and any chains, contracts, events, APIs, subgraphs, dashboards, docs, fee/revenue rules, volume methodology, start dates, or validation notes you already have.
```

Then ask only for facts that remain unknown.

## Core facts

Gather:

- protocol name as it should appear on DefiLlama
- whether this is a new listing, new dimension for an existing protocol, or focused adapter fix
- requested dashboard or metric: fees, revenue, volume, bridge volume, options, OI, incentives, users, normalized volume, or NFT volume
- chain or chains
- contracts, routers, vaults, factories, markets, event names, API endpoints, subgraphs, Dune/Allium queries, or indexer source
- start date or deployment block for each chain
- existing DefiLlama listing and related adapters, if any
- public docs, source code, explorer links, dashboards, website, and Twitter/X link

## Repo-fit routing

Use this repo when the request is for time-windowed dimension metrics supported by `adapters/types.ts`.

Stop and route elsewhere when:

- TVL, staking TVL, pool2, borrowed TVL, or treasury TVL is requested: use `DefiLlama/DefiLlama-Adapters`.
- website, logo, category, description, social links, or listing metadata only is requested: use `DefiLlama/defillama-server`.
- liquidation data is requested and no local repo evidence shows it belongs here.
- the requested metric is not in `whitelistedDimensionKeys` in `adapters/types.ts`.
- the requested folder exists but is not core-wired, such as `aggregator-options`.

## Metric semantics

Do not trust the category name alone. Confirm the economic meaning:

- Fees: what users pay, whether it is transaction fee, borrow interest, trading fee, settlement fee, gas fee, or another source.
- Revenue: what the protocol keeps, what goes to treasury, what goes to holders, and what goes to supply-side participants.
- Incentives: whether the value is token emissions, rewards, block rewards, or grants rather than user-paid fees.
- DEX/perps volume: whether the figure is actual traded volume and whether it counts taker side only.
- Aggregator volume: whether volume is routed through the aggregator and not underlying venue volume.
- Bridge aggregator volume: whether it is value bridged, not fees or swap-only volume.
- Options: whether notional and premium are both available and not confused.
- Open interest: whether the value is end-of-period outstanding notional.
- Users: whether counts are unique users, new users, transactions, or gas used.

## Source-quality gate

Prefer sources in this order:

1. on-chain logs or contract calls when feasible
2. maintained subgraphs or DefiLlama indexer data
3. Dune/Allium/query engines for complex reconstruction
4. protocol APIs only when they are the only practical source or match strong repo precedent

For APIs, ask whether the API supports historical windows. If it only reports current or trailing values, require a clear reason for `runAtCurrTime`.

## PR metadata intake

For new protocol listings, collect website and Twitter/X links because `GUIDELINES.md` asks for them. Use `pull_request_template.md` for listing metadata. For focused fixes, write a concise reason/details section instead of inventing listing fields.
