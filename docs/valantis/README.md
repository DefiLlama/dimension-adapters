# Valantis split: dimension adapter PR handoff

Draft integration notes, prepared on 2026-10-26. Registration and server migration require a coordinated rollout with the companion TVL/yield changes.

Website: https://www.valantis.xyz ; app: https://app.valantis.xyz ; X/Twitter: https://x.com/ValantisLabs . Existing stHYPE social: https://x.com/stakedhype . Docs/audit references: https://docs.valantis.xyz/stakedhype/restaking and https://docs.valantis.xyz/resources/audits . Final child categories, logos and registration IDs require metadata coordination.

## Routing and scope

| Proposed product | DEX route | Fee route | History |
| --- | --- | --- | --- |
| `valantis-sthype` | None: staking is not trading | `fees/valantis-sthype` | First observed Rebase: 2025-02-22, block 172466 |
| `valantis-sthype-stex` | `dexs/valantis-sthype-stex` | `fees/valantis-sthype-stex` | AMM deployment: 2025-04-02, block 1937868 |
| `valantis-khype-stex` | `dexs/valantis-khype-stex` | `fees/valantis-khype-stex` | AMM deployment: 2025-07-07, block 7773262 |
| `valantis-sthype-restaking` | None: deposits are not trading | `fees/valantis-sthype-restaking` | First observed RewardsFunded: 2026-10-14, block 48545658 |

The AMM fee files reexport the same helper-backed adapters as the DEX routes; register volume and fee dashboards without summing the two routes as different earnings sources. No lending/staking volume is invented for the other products.

Replace old combined `valantis-stex` (ID 5987) and old `staked-hype` fee routing (stHYPE ID 6457) through a coordinated server migration. The user requested four separate listings and retirement of the combined aggregate, not a fifth active listing. Old source modules are removed in this proposed change; do not merge those removals before updating server mappings. Preserve/archive existing stored history and audit historical factory pools outside these two AMMs separately. The `defillama-server` per-child `dimensions` mappings are a separate required follow-up. No server/history changes have been made here.

## Fee methodology / common review questions

- Swap volume is one gross input leg; fee is the actual Swap amount, not a fixed rate. Replay manager share changes in block/log order; current 20% is not hardcoded for history. Every manager recipient is Valantis-controlled, so the entire manager share is protocol revenue.
- Instant LP withdrawals emit no Swap event and are not DEX volume. Exact manager revenue is matched pool/lending funding minus the user payout. Reconstruct gross fees as `ceil(managerRevenue * 10000 / historicalManagerBps)`, the smallest spread consistent with contract rounding. At a 20% share this undercounts gross/LP fees by at most **4 wei of HYPE per withdrawal**; protocol revenue stays exact. Partition batched withdrawals by LP burn/final event and replay module/rate changes in log order, not whole-transaction sums.
- No extra revenue on fee claims, no execution traces and no cross-block quote estimates. Missing or inconsistent receipts throw rather than saving fabricated fees.
- stHYPE tracks gross staking rewards reconstructed from net rebases and the ordered protocol fee, with negative rebases retained as holder losses. The gross-up inversion has wei-level rounding limits. Current 10% is not assumed for all history.
- Restaking tracks **new on-chain funded HYPE premiums**, allocated fully to restakers, with zero retained revenue. Exclude principal, recycled scheduled reserves, base stHYPE yield and later stream releases. It is not a verified private-deal earnings history. User owns final dashboard classification after submission; no private payment history was investigated.
- Legitimate zero flow: no swaps, no instant spread, no rebase, or no new funding. kHYPE's withdrawal-only pause is verified at block 41283056, 2026-07-24T03:02:00Z; current zero trading is expected. kHYPE first LP mint was 2025-07-07, first Withdraw 2025-07-10 and first Swap 2025-07-14 in the bounded launch-history check.
- Fees/volume can be tiny when execution swap fees are small; withdrawal spread can also create fees without DEX volume. The fee-to-volume ratio is therefore not a fixed fee tier.
- Differences from the old dashboard: split pool coverage, gross-input volume, historic rate replay, explicit withdrawal fees, and restaking funding-date rather than release-date recognition. Raw `fees = revenue + supply-side revenue` allocations are exact per token; CLI USD output rounds values independently.
- Refill required: stHYPE fees from 2025-02-22; stHYPE STEX from 2025-04-02; kHYPE STEX from 2025-07-07; funded restaking premiums from 2026-10-14. Do not proportionally split old combined daily totals.

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
pnpm test dexs valantis-sthype-stex 2026-10-26
pnpm test fees valantis-sthype-stex 2025-04-03
pnpm test fees valantis-sthype-stex 2026-10-26
pnpm test dexs valantis-khype-stex 2025-07-08
pnpm test dexs valantis-khype-stex 2026-07-01
pnpm test fees valantis-khype-stex 2026-10-26
pnpm test fees valantis-khype-stex 2025-07-11
pnpm test fees valantis-khype-stex 2025-07-12
pnpm test fees valantis-sthype 2026-10-26
pnpm test fees valantis-sthype-restaking 2026-10-26
pnpm test fees valantis-sthype 2025-02-23
pnpm test fees valantis-sthype-restaking 2026-10-15
```

Validation includes twelve unit tests: integer rounding bounds across changing rates, exact protocol revenue, no tracing, batched exits, same-block module/rate changes, ordinary HYPE-only exits and the narrowly scoped zero-share exception. All six current DEX/fee routes are exercised alongside historical launch/active trading days and kHYPE's pre-setup exits. CLI dates are window **ends** (D+1 to test day D), with all 24 hourly slots. Tests also cover the first stHYPE rebase day and first restaking funding day, plus representative early zero-flow dates. An earlier stHYPE launch-day CLI attempt queried before chain genesis; bounded chain logs subsequently established 2025-02-22 as the first actual Rebase and the fee start was corrected to that observed date, not moved to conceal missing history.

Example October 25 results: stHYPE STEX ~$41.92K volume / ~$0.20 fees; stHYPE ~$10.33K gross rewards / ~$1.03K revenue; restaking ~$772 funded premiums / zero retained revenue. kHYPE on June 30 had ~$115.21K volume and ~$241.19 fees including ~$147.76 instant-withdrawal spread. These are historical observations, not quotes.

No dependencies, lockfiles, core type/build wiring or unrelated factories were modified. Parent TVL exclusions and yield IDs are covered by the companion TVL/yield PRs, not arbitrary exports here.
