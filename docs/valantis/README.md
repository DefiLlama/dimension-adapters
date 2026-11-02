# Valantis combined-STEX and restaking dimensions

Updated November 2, 2026 after the companion TVL PR merged. Retain the existing stHYPE and combined STEX listing identities; add restaking premiums under its now-live listing. No per-pool TVL split or history retirement is requested.

Website: https://www.valantis.xyz ; app: https://app.valantis.xyz ; X/Twitter: https://x.com/ValantisLabs . Existing stHYPE social: https://x.com/stakedhype . Docs/audit references: https://docs.valantis.xyz/stakedhype/restaking and https://docs.valantis.xyz/resources/audits .

## Routing and scope

| Registered product | DEX route | Fee route | History |
| --- | --- | --- | --- |
| `sthype`, ID 6457 | None: staking is not trading | Existing `fees/staked-hype` | Existing start 2025-02-18 retained; first Rebase 2025-02-22, block 172466 |
| `valantis-stex`, ID 5987 | Existing `dexs/valantis-stex` | `fees/valantis-stex` | Existing start 2025-03-27 and older factory pools retained; current stHYPE/kHYPE AMMs deployed 2025-04-02 / 2025-07-07 |
| `valantis-sthype-restaking`, ID 9281 | None: deposits are not trading | `fees/valantis-sthype-restaking` | First RewardsFunded: 2026-10-14, block 48545658 |

The combined STEX fee file reexports the DEX implementation; register both dashboards without summing them as separate earnings sources. No lending/staking volume is invented for the other products.

Keep existing server mappings and stored history. Discovery from the existing Valantis factory, including the existing liquidity/pricing filter for other pools, is retained. The two current STEX pools are counted once and add verified LP-withdrawal fees; other factory pools retain swap coverage without being assigned unsupported STEX withdrawal behavior. Existing swap and stHYPE breakdown labels are preserved. Server-side `dimensions` routing for combined STEX fees and new restaking fees remains a separate follow-up; no server/history changes are made here.

## Fee methodology / common review questions

- Swap volume is one gross input leg; fee is the actual Swap amount, not a fixed rate. Replay manager share changes in block/log order; current 20% is not hardcoded for history. Every manager recipient is Valantis-controlled, so the entire manager share is protocol revenue.
- Instant LP withdrawals emit no Swap event and are not DEX volume. Exact manager revenue is matched pool/lending funding minus the user payout. Reconstruct gross fees as `ceil(managerRevenue * 10000 / historicalManagerBps)`, the smallest spread consistent with contract rounding. At a 20% share this undercounts gross/LP fees by at most **4 wei of HYPE per withdrawal**; protocol revenue stays exact. Partition batched withdrawals by LP burn/final event and replay module/rate changes in log order, not whole-transaction sums.
- No extra revenue on fee claims, no execution traces and no cross-block quote estimates. Missing or inconsistent receipts throw rather than saving fabricated fees.
- stHYPE tracks gross staking rewards reconstructed from net rebases and the ordered protocol fee, with negative rebases retained as holder losses. The gross-up inversion has wei-level rounding limits. Current 10% is not assumed for all history.
- Restaking tracks **new on-chain funded HYPE premiums**, allocated fully to restakers, with zero retained revenue. Exclude principal, recycled scheduled reserves, base stHYPE yield and later stream releases. It is not a verified private-deal earnings history. User owns final dashboard classification after submission; no private payment history was investigated.
- Legitimate zero flow: no swaps, no instant spread, no rebase, or no new funding. kHYPE's withdrawal-only pause is verified at block 41283056, 2026-07-24T03:02:00Z; current zero trading is expected. kHYPE first LP mint was 2025-07-07, first Withdraw 2025-07-10 and first Swap 2025-07-14 in the bounded launch-history check.
- Fees/volume can be tiny when execution swap fees are small; withdrawal spread can also create fees without DEX volume. The fee-to-volume ratio is therefore not a fixed fee tier.
- Differences from the old dashboard: gross-input volume, historic rate replay, explicit withdrawal fees, and restaking funding-date rather than release-date recognition. Older factory pool coverage is retained, not silently removed. Raw `fees = revenue + supply-side revenue` allocations are exact per token; CLI USD output rounds metrics independently.
- Refill required on the existing identities: combined STEX from 2025-03-27, including withdrawal fees from each verified AMM's deployment; stHYPE from 2025-02-18 (verified zero before the first Rebase on February 22); new funded restaking premiums from 2026-10-14. No proportional split, source deletion or retirement of combined history is requested.

### Historical manager rates / zero-share handling

PoolManagerFeeSet history through block 49608108 contains one setup event per pool, both setting 2000 bps (20%):

- stHYPE: block **1937930**, 2025-04-02T13:43:00Z, transaction `0xc844fd6ddeacfd8c14a0d34fb7ea1f3ef1fb614b508cf7147772e9ee9b340566`. No withdrawals preceded setup.
- kHYPE: block **8134100**, 2025-07-11T15:28:00Z, transaction `0x230550b14656547234f69a0b406e6236ac6f0be9accb3586b62d9effc6db7042`. Two instant exits preceded setup, at blocks **8037281** (`0xfa2fe4baf8426aebe2698be073211a4a566948474b31fdaf6bb6e0c4ee95a283`) and **8126199** (`0x342a2bac04f2292d439d1383aae5c718a81d39ed35e0f7c968af1b6c9e222dd7`). Both were HYPE-only, with zero LST pool reserves before/after and zero pending LST unstaking before the call, hence no conversion spread.

The known pre-setup zero-spread period is handled explicitly without moving the start date. A **later** zero-manager-share withdrawal fails explicitly: manager receipts cannot bound its LP spread, so the 4-wei accuracy claim would not apply. No arbitrary percentage is substituted for a zero rate. At any positive historical rate `r`, the maximum undercount is `ceil(10000/r) - 1` wei. This is a deliberate user-approved simplification, not a claim of wei-exact gross fees.

## Production RPC requirement

Configure an archive-only HyperEVM SDK provider list. `HYPERLIQUID_RPC` alone appends public fallbacks; a latest-only fallback caused mismatched historical data during testing. `HYPERLIQUID_WHITELISTED_RPC` (or equivalent runner routing) was used locally to restrict providers. AMM fee runs use ordinary historical state calls and **one transaction receipt per distinct candidate transaction**. `debug_traceTransaction` / `callTracer` is **not required or called**. No private RPC URL is embedded in source.

Hourly boundaries normalize the runner's `(fromTimestamp, toTimestamp]` into a nonoverlapping half-open interval; regression tests cover adjacent slots and same-block fee changes.

## Validation

```sh
node --test -r ts-node/register/transpile-only tests/valantis.test.ts
pnpm run ts-check
pnpm run ts-check-cli
pnpm test dexs valantis-stex 2026-11-02
pnpm test fees valantis-stex 2026-11-02
pnpm test dexs valantis-stex 2025-03-29
pnpm test fees valantis-stex 2026-07-01
pnpm test fees valantis-stex 2025-07-11
pnpm test fees staked-hype 2026-11-02
pnpm test fees valantis-sthype-restaking 2026-11-02
pnpm test fees staked-hype 2025-02-19
pnpm test fees staked-hype 2025-02-23
pnpm test fees valantis-sthype-restaking 2026-10-15
```

Validation includes fourteen unit tests: integer rounding bounds, exact protocol revenue, no tracing, batched exits, same-block module/rate changes, zero-spread launch exits, combined-factory deduplication, token1 attribution and existing start preservation. All four current DEX/fee routes pass, alongside early factory history, active kHYPE trading, the first stHYPE Rebase and first restaking funding. A separate run of the unchanged upstream STEX adapter on March 28, 2025 reproduced the new adapter's ~$1.46 volume, demonstrating retained pre-current-AMM history.

An additional live-data check on June 30, 2026 verified raw per-token fee/revenue/supply-side identities, user-fee equality and protocol-revenue equality in all 24 hourly windows using the actual SDK balances objects.

CLI dates are window **ends** (D+1 to test day D), with all 24 hourly slots. The preserved February 18 stHYPE start returns verified zero before the first Rebase. Its earliest UTC slots still cause the shared runner to log pre-genesis block-lookup warnings before the adapter runs; the adapter itself does not require those missing blocks and the daily test completes with zero. No shared runner code is modified.

Example November 1 results: combined STEX ~$10.62K volume / ~$0.94 fees / ~$0.19 revenue; stHYPE ~$11.71K gross rewards / ~$1.17K revenue; restaking ~$869 funded premiums / zero retained revenue. Combined STEX on June 30, 2026 had ~$180.47K volume and ~$246.45 fees, including ~$147.78 instant-withdrawal spread. These are observations, not quotes.

No dependencies, lockfiles, core type/build wiring or unrelated factories were modified. Parent TVL exclusions are live; assigned yield IDs are supplied in the companion Yields PR, not arbitrary exports here.
