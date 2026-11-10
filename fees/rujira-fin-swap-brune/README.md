# Rujira analytics adapters

The Rujira fees and DEX volume adapters use Analytics v2, the authoritative
Rujira analytics source, for the covered products and DefiLlama metrics.

Historical coverage depends on the data available in Analytics v2. Unavailable
required inputs fail explicitly so historical requests do not store artificial
zeroes or partial fee totals.

- Website: https://rujira.network
- X / Twitter: https://x.com/RujiraNetwork
- Documentation: https://docs.rujira.network
- Analytics endpoint: https://analytics.rujira.network/api/v2/graphql

## Implementation

`helpers/rujira.ts` supplies the existing `fees/rujira-fin-swap-brune` and
`dexs/rujira-trade` adapters. Both integrations query Analytics v2 directly.
The helper uses product-level summaries for each requested day.

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

The bRUNE protocol commission follows the split in the
[bRUNE documentation](https://docs.rujira.network/core-products/brune-liquid-bonded-rune).
FIN allocation is read dynamically. Swap affiliate fees are read directly,
not estimated from volume.

### Time windows and input handling

- Queries use a completed UTC day with an inclusive start and exclusive end.
- Both adapters use version 1 and completed UTC-day summaries. Intraday
  summaries are not treated as additive daily components; partial days are
  rejected.
- API USD amounts are unscaled decimal strings and use decimal arithmetic;
  conversion to JavaScript numbers happens at the adapter output boundary.
- Missing, malformed, negative or non-finite required inputs throw. An
  impossible allocation or VS deduction also throws.
- A measured zero remains a valid observation. A measured zero FIN total does
  not require an allocation share; a nonzero FIN total does.
- Analytics v2 is used for historical requests as well as recent days.

### Metrics and scope

The fees adapter exports `dailyFees`, `dailyUserFees`, `dailyRevenue`,
`dailyProtocolRevenue` and `dailySupplySideRevenue`. All emitted fee labels
have matching methodology entries. The DEX adapter emits `dailyVolume` without
breakdown labels, as required by the DEX category guidelines.

The income statement keeps gross fees equal to protocol revenue plus
supply-side revenue. bRUNE user rewards are supply-side revenue. Protocol-retained
revenue is reported as `dailyProtocolRevenue`; separate tokenholder distributions
are outside this adapter's scope.

The adapters cover THORChain with a `2026-01-01` start date. The fee scope is
FIN, RUJI Swap affiliate fees and bRUNE. Separate VS protocol fees, gas,
THORChain liquidity fees, Ghost, money
market, liquidation and Index revenue are excluded.

Fees cover several products and include FIN arbitrage profits and bRUNE yield,
while DEX volume covers FIN fills. The combined fee metric therefore cannot be
interpreted as a fixed percentage of FIN trading volume. Dashboard checks must
use the same product scope, UTC window and Analytics v2 source.

## Listing

The public listing is Rujira Trade (`rujira-trade`). Its fees module is
`rujira-fin-swap-brune` and its volume module is `rujira-trade`.
Public summary paths use the listing slug:

- `https://api.llama.fi/summary/fees/rujira-trade?dataType=dailyFees`
- `https://api.llama.fi/summary/fees/rujira-trade?dataType=dailyRevenue`
- `https://api.llama.fi/summary/dexs/rujira-trade?dataType=dailyVolume`
