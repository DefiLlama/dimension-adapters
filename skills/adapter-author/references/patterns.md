# Patterns

Pick a category, then read the named file before writing code. This table is a routing aid, not a substitute for inspection.

## How the runtime is wired

- `pnpm test` runs `cli/testAdapter.ts` (`package.json`).
- `adapters/utils/importAdapter.ts` resolves a file under the category folder, then falls back to factory-backed adapters via `factory/registry.ts`.
- `adapters/utils/runAdapter.ts` builds `FetchOptions`, validates chains, applies `start`/`deadFrom`, runs `prefetch`, converts `Balances` to USD, rejects NaN/negative/implausibly large values, and validates labeled fee breakdowns.
- `cli/buildModules.ts` builds `cli/dimensionModules.json` from `ADAPTER_TYPES`, file adapters, factory adapters, and dead adapters.

## Category routing

| Request | Folder / target | Required metric(s) | Inspect first |
| --- | --- | --- | --- |
| Protocol fees/revenue | `fees/` | `dailyFees`, `dailyRevenue` | `fees/GUIDELINES.md`, `helpers/metrics.ts`, labeled fee adapters |
| Spot DEX volume | `dexs/` | `dailyVolume` | `dexs/GUIDELINES.md`, `helpers/uniswap.ts`, `factory/uniV2.ts`, `factory/uniV3.ts` |
| Perp protocol volume | `dexs/` (usually) | `dailyVolume`, optional OI | `dexs/GUIDELINES.md`, perp examples in `dexs/` |
| DEX aggregator volume | `aggregators/` | `dailyVolume` | `aggregators/GUIDELINES.md` |
| Derivatives aggregator | `aggregator-derivatives/` | `dailyVolume`, optional OI | `aggregator-derivatives/GUIDELINES.md` |
| Bridge aggregator | `bridge-aggregators/` | `dailyBridgeVolume` | `bridge-aggregators/GUIDELINES.md`, `helpers/aggregators/bungee.ts` |
| Options | `options/` | `dailyNotionalVolume`, `dailyPremiumVolume` | `options/GUIDELINES.md` |
| Open interest only | `open-interest/` | `openInterestAtEnd` | `open-interest/GUIDELINES.md` |
| Incentives | `incentives/` | `tokenIncentives` | `incentives/GUIDELINES.md`, `adapters/types.ts` |
| Active users | `active-users/` or `users/list.ts` factory | `dailyActiveUsers` | `users/list.ts`, `active-users/` examples |
| New users | `users/list.ts` factory | `dailyNewUsers` | `users/list.ts`, `factory/registry.ts` |
| Normalized volume | `factory/normalizedVolume.ts` | `dailyNormalizedVolume`, `dailyActiveLiquidity` | `factory/normalizedVolume.ts`, `factory/registry.ts` |
| NFT volume | `factory/nftVolume.ts` | `dailyVolume` | `factory/nftVolume.ts`, `factory/registry.ts` |

## File-backed vs factory-backed

Most adapters are file-backed under their category folder. These are factory-backed and need registry inspection first:

- `normalized-volume` - empty folder; backed by `factory/normalizedVolume.ts`.
- `nft-volume` - no folder; backed by `factory/nftVolume.ts`.
- `active-users` - mixed; many protocols come from `users/list.ts`.
- `new-users` - no folder; generated from `users/list.ts:newUsers`.

When touching a factory-backed path, inspect `factory/registry.ts`, run the specific adapter test by hand, and run `pnpm run build`.

## Classification hazards

- `derivatives` is not a normal target. `AdapterType.DERIVATIVES` exists but `cli/buildModules.ts` skips it and `factory/registry.ts` resolves derivatives factory lookups under `dexs`. For "derivatives adapter" requests, decide:
  - protocol perps volume -> `dexs/`
  - routed perps volume -> `aggregator-derivatives/`
  - OI only -> `open-interest/`
- `aggregator-options` has a folder and guidelines but is not in `AdapterType`, PR CI roots, or `factory/registry.ts`. Do not add to it without maintainer confirmation.

## Helper and factory reuse

Reuse is the default. Inspect before writing custom logic:

- Uniswap V2/V3: `helpers/uniswap.ts`, `factory/uniV2.ts`, `factory/uniV3.ts`.
- Solidly, Balancer, Curve, GMX, Aave, Compound, Liquity: matching files in `helpers/` and `factory/`.
- Bungee-like aggregator/bridge flows: `helpers/aggregators/bungee.ts`.
- Hyperliquid, Symmio, Orderly: matching factory/helper files.
- Dune/Allium: `helpers/dune.ts`, `helpers/allium.ts`, plus SQL under `helpers/queries/`.

Do not force a helper when event semantics, fee splits, or routing differ. If using one would hide a correctness call, inspect representative adapters and decide explicitly.

## Versions and time windows

- Prefer v2 for on-chain logs, contract calls, subgraphs, and query engines with timestamp filters. Use v1 only when the source only returns daily aggregates.
- Use `pullHourly: true` for v2 EVM-log or Allium adapters unless you have a documented reason not to.
- Use `runAtCurrTime` only when historical windows are not available and repo precedent supports it.

## Common traps

- Plausible-sounding but economically wrong fee/revenue/holder/supply-side attribution.
- Missing labels, or `.add(..., label)` and `breakdownMethodology` out of sync.
- Deprecated `dailyBribesRevenue` or `dailyTokenTaxes` instead of holder-revenue sections.
- Using `dailyTokenIncentives` (not a runtime key) instead of `tokenIncentives`.
- Counting maker plus taker volume on perps.
- Aggregator volume double-counting underlying DEX, bridge, options, or derivatives volume.
- Confusing options notional with premium.
- Beginning-of-period OI instead of end-of-period.
- Treating bridge fees or in-chain swaps as `dailyBridgeVolume`.
- Accepting API totals without checking source quality, timestamps, and staleness.
