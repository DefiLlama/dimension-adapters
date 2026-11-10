# Jitter Fees And Revenue

Existing TVL listing: https://defillama.com/protocol/jitter
Website: https://jitter.fi
Twitter: https://x.com/Jitter_finance

## Scope

- Yield markets: actual `MarketSwapEvent.fee` and its `reserve_fee` split;
  gross checkpointed `user_interest_raw + treasury_interest_raw` and the actual
  treasury share. No hardcoded fee percentage or inferred volume multiplier.
- Jitter Points: actual maker/taker `fee_amount` from the verified
  JITTER_POINT/USDC book `0x3deb69e0b256375f8805a392b9258c5236ad8cc028b8789e2d2240b24636dd1d`.
  Other Liquidlink projects are excluded. A new Jitter-branded book must be
  verified before extending that scope.
- Fees = Revenue + SupplySideRevenue; all recognized revenue accrues to the
  protocol. No governance-token-holder distribution is assumed.

## Units And Timing

Swap fee counters are SY atomic units. The oracle-consumed index BEFORE the
swap in that same transaction converts to underlying atomic units. Multiple
operations in one PTB are ordered by event sequence, not timestamps. Missing
rates fail rather than using today's exchange rate for a historical trade.

Interest counters are Q64 fractional SY atomic units; their checkpoint index
is also Q64. Both factors must be divided out. Balances are accumulated before
flooring to integer underlying atoms; supply-side output is the rounded gross
minus rounded protocol output to preserve the allocation identity. This loses
less than one underlying atomic unit per asset/category/window, not user funds.

Yield is recognized at on-chain interest checkpoints. Those checkpoints may
crystallize growth since a previous transaction; this is NOT a reconstructed
calendar-day economic-yield series. Uncheckpointed growth is not estimated.
Later claims, settlement summaries and treasury collections are not counted
again. The methodology explicitly discloses this limitation for review.

Deposits, trade notionals, unspent maker fee reserves, principal/dust transfers,
donations, token incentives and upstream protocol fees are not Jitter revenue.
No operating costs or net-income figure is invented.

## Validation

```sh
node --test -r ts-node/register/transpile-only fees/jitter/accounting.test.ts
pnpm test fees jitter 2026-11-10 sui
pnpm test fees jitter 2026-11-06 sui
pnpm test fees jitter 2026-11-08 sui
pnpm run ts-check
```

The CLI date is the window END: these cover Nov 9, Nov 5 and Nov 7 UTC.
Nov 7 has no fee events. Nov 8 has checkpointed yield and point fees despite no
AMM trades, so it must not be treated as a zero-revenue day. Empty hourly
intervals are expected for the current small-volume deployment.
