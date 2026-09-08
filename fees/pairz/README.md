# Pairz — draft fees submission

Website: https://pairz.fun
Twitter: https://x.com/PairzFun
Docs: https://docs.pairz.fun
Chain: Solana; requested category: Launchpad
Protocol token: `3URpNcV9wAPjwMAyuBsPjwwkGN9wFJuwcRs3RMbdpair`

This remains a draft, not complete protocol coverage. Public launch time and private-test treatment must be agreed before listing customer activity.

## Implemented and tested

LaunchLab pools are attributed by platform `3om3BermKeuUVXEbtktzkiuPh4mY5fn1c8cNh1TR3DUj`, not mint suffix or incoming wallet transfers. Successful transactions are checked against `solana.transactions`: the decoded LaunchLab call tables do not expose `call_success`. The three initialization variants are deduplicated before joining trades. Registration on 7 September 2026 bounds history scans.

Actual platform, Raydium protocol and creator fees are aggregated as integer strings in each quote mint. Fees equal Pairz platform revenue plus the other two components. Referral/share fees are included separately from Pairz revenue. No completed buyback is inferred from an allocation. Raydium overlap is marked `doublecounted`.

Platform registration: https://solscan.io/tx/5W1AnfdEMHBAoYPkAeMMoPcsnh8VjzRjDzFeWjgzRoLdVuDPj1JG4cgS4ri3mJuoR4kzEgMzx78FxfVN9u2VV2Yb

Live Dune validation on 8 September 2026:

| Private test pool quote | Trades | Pairz platform fee, raw | Raydium fee, raw | Creator fee, raw |
| --- | ---: | ---: | ---: | ---: |
| USDC (6 decimals) | 2 | 20405 | 5102 | 0 |
| AAPLx (8 decimals) | 4 | 63892 | 15975 | 0 |

These are a partial day's private-test observations, not customer revenue or public launch traction. All six events had zero share_fee. Six unique trade records reconciled exactly with the per-quote aggregate; buys and sells were present in both pools. This is reconciliation within Dune, not an independent RPC finality audit.

Dune executions:
- Decoded LaunchLab schema: `01M1ZAWXKQFJADGMMP0J0MGWMG`
- Nonzero aggregate: `01M1ZAY5D2CXRW5WF6TP5GMWX4`
- Six individual trade records: `01M1ZB14KFS42SAFYMHBX1G52T`
- CPMM schema: `01M1ZAYSMJ4M6HW5V5RY5BW783`

Both upstream commands passed after schema correction:

```sh
npm test fees pairz 2026-09-08 # 7 September UTC: zero activity
npm test fees pairz 2026-09-09 # 8 September UTC: partial private-test day
```

The latter priced both quote tokens and printed approximately $0.2808 fees, $0.2246 Pairz revenue and $0.0562 supply-side revenue at test time. Prices and the current day's totals can change. Version 1 explicitly uses `startOfDay` through the next midnight, avoiding the upstream runner's extra preceding second.

28 offline checks and a targeted TypeScript check also pass:

```sh
npx ts-node --transpile-only fees/pairz/validation.test.ts
```

No credentials are included in this submission.

## Remaining before merge

- Confirm public production start time, pool coverage, test-activity exclusions, and independent finalized transaction reconciliation.
- Validate the implemented raw CPMM path against a real Pairz migration and nonzero Pairz creator fee. Current live registry query returned zero Pairz migrations. Tests on unrelated public pools prove decoding/query behavior, not Pairz migration or revenue attribution.
- Add historical Pump creator-fee accounting with the actual dated fee policy, operating costs, reserve and distribution evidence. Do not apply today's LaunchLab allocation backward.
- Add attributable, completed PAIRZ buybacks and holder distributions. The newer manual-buyback-funding completion proves a transfer only, not a completed buyback; acquisition and burn must not be counted twice.
- Finish transfer-tax coverage. CPMM rejects nonzero transfer-tax events rather than omitting them. LaunchLab share fees are now included; nonzero share fees have synthetic coverage, while observed Pairz test events had zero.
- Agree treasury/holder classification and Raydium fee overlap with maintainers. Validate pricing for additional quote and launched-token fee assets.

No TVL or volume is claimed. Rent, deposits, market capitalization, funding, reimbursements and launch receipts are not fee revenue.


## Raw CPMM coverage

`cpmm.ts` discovers successful migrations from the exact Pairz platform, validates the target CPMM program and per-pool base/quote identities, and reads successful raw transactions mentioning those pools. It does not rely on the stale decoded CPMM event table. Registry counts must reconcile with LaunchLab migration coverage.

`cpmm-events.ts` decodes the current 170-byte Anchor event. It tracks the invocation stack to attribute events to the actual CPMM program and discards events from failed nested frames. Missing/truncated logs, unsupported event layouts, unmatched swap instructions, duplicate transactions, wrong mints and unexpected transfer taxes fail rather than become zero fees.

CPMM trade fees stay in the input mint and belong to Raydium/LPs; creator fees use the event's explicit side and Pairz's quote-mint requirement. Raydium protocol/fund cuts are already inside trade_fee and are not added again. The buy/sell fee identities are tested per mint.

Live raw validation: `01M1ZB7RP5AS388XH05WXWNFA9` returned three public transactions, each successfully decoded. Exact generated pool-filter SQL `01M1ZBHM2GRJX5KB0RVW9M8DHY` returned six transactions, including buy and sell directions; all decoded successfully. These pools are unrelated to Pairz and contribute nothing to this listing. Captured regression fixtures include the first three transactions. Their creator fees were zero; nonzero creator-fee behavior is currently synthetic-test coverage.

Actual Pairz migration registry query `01M1ZBCAP30BQE4QNXZ5NMPD9G` returned no migrations. The integrated upstream daily Pairz test passed with raw CPMM support and LaunchLab referral fees present.

```sh
npx ts-node --transpile-only fees/pairz/cpmm-events.test.ts
npx ts-node --transpile-only fees/pairz/cpmm.test.ts
```

## Historical canary reconciliation

The documented 5 September test cycle's collection, buyback and burn were retrieved with Dune execution `01M1ZBCXF68SRFPX9Z612Q9X98`. Collection transferred 18,879,866 lamports from the expected Pump vault; the buyback funded 1,025,784 lamports and acquired 1,493,746,159 raw official PAIRZ, followed by a matching Token-2022 BurnChecked for the full amount. Account balances and mint/owner identities agree. This is one completed buyback, not separate acquisition and burn revenues.

The original test ledger reserved 13,750,945 lamports before its 80/20 split: holder allocation 4,103,137; protocol allocation 1,025,784. Actual recorded costs 8,184,238 leave 5,566,707 of reserve carry. The separate 1,678,245-lamport setup-rent refund is excluded from creator revenue and buyback principal. This historical test proof is not an automated production settlement feed and is not included in public customer totals.
