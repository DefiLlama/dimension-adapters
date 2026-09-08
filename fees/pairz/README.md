# Pairz — draft fees submission

Website: https://pairz.fun
Twitter: https://x.com/PairzFun
Docs: https://docs.pairz.fun
Chain: Solana; requested category: Launchpad
Protocol token: `3URpNcV9wAPjwMAyuBsPjwwkGN9wFJuwcRs3RMbdpair`

This remains a draft, not complete protocol coverage. Public launch time and private-test treatment must be agreed before listing customer activity.

## Implemented and tested

LaunchLab pools are attributed by platform `3om3BermKeuUVXEbtktzkiuPh4mY5fn1c8cNh1TR3DUj`, not mint suffix or incoming wallet transfers. Successful transactions are checked against `solana.transactions`: the decoded LaunchLab call tables do not expose `call_success`. The three initialization variants are deduplicated before joining trades. Registration on 7 September 2026 bounds history scans.

Actual platform, Raydium protocol and creator fees are aggregated as integer strings in each quote mint. Fees equal Pairz platform revenue plus the other two components. No completed buyback is inferred from an allocation. Raydium overlap is marked `doublecounted`.

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
- Add migrated CPMM fees. Live schema inspection found the existing `raydium_cp_swap_evt_swapevent` table lacks input/output mint, trade-fee and creator-fee fields from the newer Raydium event. An updated decoder or independently verified raw-event source is required. This draft stops if a migration is detected.
- Add historical Pump creator-fee accounting with the actual dated fee policy, operating costs, reserve and distribution evidence. Do not apply today's LaunchLab allocation backward.
- Add attributable, completed PAIRZ buybacks and holder distributions. The newer manual-buyback-funding completion proves a transfer only, not a completed buyback; acquisition and burn must not be counted twice.
- Verify transfer-tax and nonzero referral/share-fee treatment before reporting periods where they apply.
- Agree treasury/holder classification and Raydium fee overlap with maintainers. Validate pricing for additional quote and launched-token fee assets.

No TVL or volume is claimed. Rent, deposits, market capitalization, funding, reimbursements and launch receipts are not fee revenue.
