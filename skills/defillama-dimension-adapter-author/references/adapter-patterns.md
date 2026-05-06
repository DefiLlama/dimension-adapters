# Adapter Patterns

Use this reference to choose repo-native dimension adapter patterns. Inspect the named files before implementing; do not rely on this summary alone when editing.

## Runtime model

`package.json` maps `pnpm test` to `ts-node --transpile-only cli/testAdapter.ts`. The tester imports a file first through `adapters/utils/importAdapter.ts`, then falls back to helper/factory adapters from `factory/registry.ts`.

`adapters/utils/runAdapter.ts` sets defaults, builds `FetchOptions`, checks chain names, handles `start` and `deadFrom`, runs `prefetch`, converts `Balances` to USD, rejects NaN/negative/implausibly high values, and validates labeled fee breakdowns.

`cli/buildModules.ts` builds ignored `cli/dimensionModules.json` from `ADAPTER_TYPES`, file adapters, factory adapters, and dead adapters.

## Category table

| Request shape | Primary target | Required metric(s) | Inspect first |
| --- | --- | --- | --- |
| Protocol fees/revenue | `fees/` | `dailyFees`, `dailyRevenue` | `fees/GUIDELINES.md`, `helpers/metrics.ts`, representative labeled fee adapters |
| Spot DEX volume | `dexs/` | `dailyVolume` | `dexs/GUIDELINES.md`, `helpers/uniswap.ts`, `factory/uniV2.ts`, `factory/uniV3.ts` |
| Perp protocol volume | usually `dexs/` | `dailyVolume`; optional OI fields | `dexs/GUIDELINES.md`, perp examples in `dexs/` |
| DEX aggregator volume | `aggregators/` | `dailyVolume` | `aggregators/GUIDELINES.md`, `aggregators/kyoag/index.ts` |
| Derivatives aggregator volume | `aggregator-derivatives/` | `dailyVolume`; optional OI fields | `aggregator-derivatives/GUIDELINES.md` |
| Bridge aggregator volume | `bridge-aggregators/` | `dailyBridgeVolume` | `bridge-aggregators/GUIDELINES.md`, `helpers/aggregators/bungee.ts` |
| Options protocol | `options/` | `dailyNotionalVolume`, `dailyPremiumVolume` | `options/GUIDELINES.md`, `options/typus/` |
| Open-interest-only | `open-interest/` | `openInterestAtEnd` | `open-interest/GUIDELINES.md`, contract-call and API examples |
| Incentives | `incentives/` | `tokenIncentives` | `incentives/GUIDELINES.md`, `adapters/types.ts`, `incentives/bitcoin/index.ts` |
| Active users | `active-users/` or `users/list.ts` factory | `dailyActiveUsers` | `users/list.ts`, `active-users/kyan.ts` |
| New users | `users/list.ts` factory | `dailyNewUsers` | `users/list.ts`, `factory/registry.ts` |
| Normalized volume | `factory/normalizedVolume.ts` | `dailyNormalizedVolume`, `dailyActiveLiquidity` | `factory/normalizedVolume.ts`, `factory/registry.ts` |
| NFT volume | `factory/nftVolume.ts` | `dailyVolume` | `factory/nftVolume.ts`, `factory/registry.ts` |

## File-backed vs factory-backed

Most normal adapters are file-backed under their category folder. Factory-backed categories or helper-generated protocols require registry inspection first.

Treat these as advanced/factory-backed:

- `normalized-volume`: empty folder locally; backed by `factory/normalizedVolume.ts`.
- `nft-volume`: no folder locally; backed by `factory/nftVolume.ts`.
- `active-users`: one direct file exists, but many protocols are generated from `users/list.ts`.
- `new-users`: no folder locally; generated from `users/list.ts:newUsers`.

When touching factory-backed paths, inspect `factory/registry.ts`, run the specific adapter test manually, and run `pnpm run build`.

## Classification hazards

`derivatives` is not a normal target. `AdapterType.DERIVATIVES` exists, but `cli/buildModules.ts` skips it and `factory/registry.ts` maps factory lookup to `dexs`. For a "derivatives adapter" request, clarify:

- protocol perps volume: inspect `dexs/`
- routed perps volume: inspect `aggregator-derivatives/`
- OI-only: inspect `open-interest/`

`aggregator-options` is wiring-uncertain. The folder and guidelines exist, but the category is not in `AdapterType`, PR CI roots, or `factory/registry.ts`. Stop and ask before adding or modifying this path unless maintainers explicitly confirm.

## Helper and factory reuse

Helper/factory reuse is the default. Inspect existing helpers before custom logic:

- Uniswap V2/V3: `helpers/uniswap.ts`, `factory/uniV2.ts`, `factory/uniV3.ts`
- Solidly, Balancer, Curve, GMX, Aave, Compound, Liquity: matching `helpers/` and `factory/` files
- Bungee-like bridge/aggregator flows: `helpers/aggregators/bungee.ts`
- Hyperliquid, Symmio, Orderly: matching factory/helper files
- Dune/Allium: `helpers/dune.ts`, `helpers/allium.ts`, and SQL examples under `helpers/queries/`

Do not force a helper when event semantics, fee splits, or route semantics differ. If helper use hides a correctness decision, stop and inspect representative adapters.

## Version and time windows

Use v2 when possible for on-chain logs, contract calls, subgraphs, and query-engine sources with timestamp filters. Use v1 only when the source only supports daily aggregate API-style data.

Use `pullHourly: true` for v2 adapters using EVM logs or Allium unless there is a documented reason not to. Confirm the fetch is safe for arbitrary hourly windows.

Use `runAtCurrTime` only when the source cannot provide historical windows and repo precedent supports current/trailing data.

## Common traps

- fee/revenue/supply-side/holder attribution that sounds plausible but is economically wrong
- missing labels or mismatch between `.add(..., label)` and `breakdownMethodology`
- using deprecated `dailyBribesRevenue` or `dailyTokenTaxes` instead of holder-revenue sections
- incentives docs mention `dailyTokenIncentives`, but runtime types use `tokenIncentives`
- counting maker plus taker volume in perps
- double-counting aggregator volume with underlying DEX, bridge, options, or derivatives adapters
- confusing options notional with premium
- using beginning-of-period OI instead of end-of-period OI
- treating bridge fees or swaps as `dailyBridgeVolume`
- accepting API totals without checking source quality, timestamps, and stale data
