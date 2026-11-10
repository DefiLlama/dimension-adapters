# Rujira Analytics v2 migration

The Rujira fees and DEX volume adapters are moving to Analytics v2, the
authoritative Rujira analytics source. This migration uses more accurate and
up-to-date protocol information while retaining the existing product scope and
DefiLlama metric definitions.

We are working on backfilling historical data where it can be accessed.
Historical coverage is not guaranteed. Unavailable inputs fail explicitly so
backfill attempts do not store artificial zeroes or partial fee totals.

- Website: https://rujira.network
- X / Twitter: https://x.com/RujiraNetwork
- Documentation: https://docs.rujira.network
- Analytics endpoint: https://analytics.rujira.network/api/v2/graphql

## Implementation

`helpers/rujira.ts` supplies the existing `fees/rujira-fin-swap-brune` and
`dexs/rujira-trade` adapters. Both integrations query Analytics v2 directly.
The legacy queries, pair-pagination loop and fixed-point conversion are removed.

| Metric input | Analytics v2 mapping | Accounting purpose |
| --- | --- | --- |
| FIN volume | Trade summary `volume(source: TOTAL)` | Includes FIN fills once, without adding source breakdowns to the total. |
| FIN gross fees | Trade `revenue(recipient: TOTAL, nature: TOTAL)` minus VS `protocolFees` | Includes FIN trading fees and arbitrage profits; excludes the separate VS collector payment. |
| FIN allocation to THORChain | FIN gross fees times `thorchainRevenueShare(basis: ACTUAL)` | Uses the observed collector allocation. |
| FIN allocation to Rujira | FIN gross fees minus the THORChain allocation | Preserves complete allocation of the FIN component. |
| Swap affiliate fees | Swap `revenue(recipient: RUJIRA, source: AFFILIATE_FEES)` | Includes the Rujira affiliate fee without unrelated referral or liquidity fees. |
| bRUNE user rewards | BRUNE staking `revenueToStakers(currency: USD)` | Includes net rewards for yielding and auto-compounding users. |
| bRUNE protocol commission | Net rewards times the documented protocol share divided by the user share | Accrues the commission alongside user rewards, rather than mixing it with separately timed fee transfers. |
| bRUNE gross rewards | Net user rewards plus the protocol commission | Preserves gross-yield accounting for the liquid-staking component. |

The documented bRUNE split is retained; its source is the
[bRUNE documentation](https://docs.rujira.network/core-products/brune-liquid-bonded-rune).
FIN allocation is read dynamically. Swap affiliate fees are read directly,
not estimated from volume. This migration does not introduce a fee-rate change.

### Time windows and input handling

- Queries use a completed UTC day with an inclusive start and exclusive end.
- The existing daily adapter cadence is retained. Although the API accepts
  intraday ranges, the audit did not validate those summaries as additive daily
  components. The adapters therefore remain version 1 and reject partial days.
- API USD amounts use decimal arithmetic without the former fixed-point scale;
  conversion to JavaScript numbers happens at the adapter output boundary.
- Missing, malformed, negative or non-finite required inputs throw. An
  impossible allocation or VS deduction also throws.
- A measured zero remains a valid observation. A measured zero FIN total does
  not require an allocation share; a nonzero FIN total does.
- Analytics v2 is used for historical requests as well as recent days.

### Metrics and scope

The fees adapter retains `dailyFees`, `dailyUserFees`, `dailyRevenue`,
`dailyProtocolRevenue` and `dailySupplySideRevenue`. All emitted fee labels
have matching methodology entries. The DEX adapter emits `dailyVolume` without
breakdown labels, as required by the DEX category guidelines.

The income statement keeps gross fees equal to protocol revenue plus
supply-side revenue. bRUNE user rewards are supply-side revenue. The existing
protocol-retained attribution remains in place; this source migration does not
add a new tokenholder distribution stream.

THORChain coverage, the existing fee-label strings and the `2026-01-01` start
date are retained. The fee scope remains FIN, RUJI Swap affiliate fees and
bRUNE. Separate VS protocol fees, gas, THORChain liquidity fees, Ghost, money
market, liquidation and Index revenue are excluded.

Fees cover several products and include FIN arbitrage profits and bRUNE yield,
while DEX volume covers FIN fills. The combined fee metric therefore cannot be
interpreted as a fixed percentage of FIN trading volume. Dashboard checks must
use the same product scope, UTC window and Analytics v2 source.

## Audit and review

Audit date: 2026-11-10. Reviewed the complete working diff against the rebased
upstream baseline, both adapter entry points, the shared helper and this report.
The review used the repository-wide, fees, DEX and helper guidelines plus the
adapter-author validation and pattern checklists.

| Review area | Result |
| --- | --- |
| Change scope and identity | Only the Rujira helper, existing adapters and this report are changed; listing slugs and chains are retained. |
| Query mapping and units | Checked the API schema, direct responses and decimal conversion. |
| Aggregate scope and allocations | Independently summed every FIN pair on 2026-08-17 and 2026-11-09; checked complete pagination, completed bins, volume, FIN fees and both recipient allocations. |
| Accounting and methodology | Checked actual SDK balances, income-statement identities and bidirectional label coverage for every exported fee metric. |
| Date and error behavior | Checked UTC boundaries, partial-day rejection, measured zeroes, missing fields, invalid inputs, overflow, invalid allocations and propagated request failures. |
| Local validation | Official adapter runs and both TypeScript projects pass for the available-data windows listed below; inline edge-case checks pass. |
| Dependency and core-file scope | No package, lockfile, registry, build-wiring or unrelated adapter changes. No test files are added. |
| Historical coverage | Backfill is ongoing where historical data is accessible; full coverage is not guaranteed. |

The report was reviewed against the implementation and command results after
editing. The audit found no implementation defects in the checked daily query
mapping or accounting. These checks validate local behavior and API consistency;
they do not constitute an independent replay of chain transactions or production
deployment verification.

### Validation commands

The runner date is the end of the window: pass D+1 to check day D.

```sh
DEBUG_BREAKDOWN_FEES=true pnpm test fees rujira-fin-swap-brune 2026-08-15
DEBUG_BREAKDOWN_FEES=true pnpm test fees rujira-fin-swap-brune 2026-09-26
DEBUG_BREAKDOWN_FEES=true pnpm test fees rujira-fin-swap-brune 2026-09-27
DEBUG_BREAKDOWN_FEES=true pnpm test fees rujira-fin-swap-brune 2026-11-10
pnpm test dexs rujira-trade 2026-01-02
pnpm test dexs rujira-trade 2026-11-10
pnpm run ts-check
pnpm run ts-check-cli
git diff --check
```

In Windows PowerShell, use `pnpm.cmd` and set
`$env:DEBUG_BREAKDOWN_FEES='true'` before the fee commands.

The boundary checks also confirmed that the earliest fee window can fail when
its required FIN allocation share is unavailable. That source-coverage case is
kept distinct from the passing available-data checks and is part of the
backfill work. It is never converted to a successful zero-fee day.

## Existing listing and rollout

This updates the existing Rujira Trade listing (`rujira-trade`). Its fees module
is already `rujira-fin-swap-brune`; its volume module is `rujira-trade`.
The public summary paths therefore use the listing slug:

- `https://api.llama.fi/summary/fees/rujira-trade?dataType=dailyFees`
- `https://api.llama.fi/summary/fees/rujira-trade?dataType=dailyRevenue`
- `https://api.llama.fi/summary/dexs/rujira-trade?dataType=dailyVolume`

The public endpoints were checked on 2026-11-10. No duplicate adapter, new
listing, alias file, separate API server or server-side slug mapping is needed.
The earlier Rujira listing was added in
[PR #8850](https://github.com/DefiLlama/dimension-adapters/pull/8850).

After merge, coordinate a historical refill from the existing start date where
v2 data is available, with historical gaps made explicit to DeFiLlama. Backfill
completion is not guaranteed. Recheck the published fee, revenue and volume
series after deployment and refill; local checks do not publish this change.

## Suggested PR description

Migrate the existing Rujira fees and DEX volume adapters to Analytics v2,
Rujira's authoritative source for more accurate and up-to-date analytics.
The shared helper uses explicit UTC-day summaries, preserves the covered
products and fee allocations, and fails on unavailable required inputs.
Fee methodology is documented for every exported metric, and volume labels
are removed in line with the DEX adapter guidelines.

We are working on backfilling historical data where it can be accessed, but
full historical coverage is not guaranteed. Request a refill from the existing
start date for the available v2 history after merge. This updates the existing
listing and requires no additional server-side mapping.

Validation: historical and recent adapter runs, both TypeScript projects,
UTC-window and missing-data checks, actual SDK accounting and label checks,
and independent reconciliation of the full FIN pair set.

- Website: https://rujira.network
- X / Twitter: https://x.com/RujiraNetwork
- Docs: https://docs.rujira.network
