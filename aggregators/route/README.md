# Historical creator-revenue buybacks

The early purchases in `earlyBuybacks.ts` were funded by ROUTE creator fees, as confirmed by the project operator and corroborated by the following on-chain reconciliation. They are not classified solely because the buyer was the dev wallet.

Wallet: `0x6f6afe1e23a59cdc5901f2626301d6d408d72d9b`.
Fee escrow: [`0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e`](https://repo.sourcify.dev/4663/0xd3afeb2a57f70ef218aa82451c51b2fb0416ac9e).

The read-only reconciliation covers blocks 57040684–57804296, encompassing all 100 registered purchases on September 7–8, 2026:

- The wallet's escrow balance at block 57040683 was zero.
- All 452 native `Credited` events for the wallet match the actual `creatorAmount` in ROUTE's curve `FeesSwept` or ROUTE-pool `PoolFeesSwept` event in the same transaction. No unmatched credits or other depositors were found. The pool is `0x220e47dde1a5180cb131d4c720abf66d5c36fbdf3af91522f7b1c7f749770d8f`; the curve is `0xfdf8bf3a9a9facde8a5304ccaa462c75b04b3042`.
- 103 successful, canonical `Claimed` receipts pay **82.476240514240000998 ETH** to the wallet. The escrow's verified `_claim` implementation pays the caller and emits `Claimed` only after successful payment.
- The 100 registered buys use **54.1028 ETH** of pool/executor input. Ordering claims and purchases by block and transaction index, cumulative claims exceed cumulative purchase input before every purchase. The minimum surplus is **0.341483419832425069 ETH**.
- This comparison corroborates the operator's funding attribution. It is not a complete reconciliation of every native-wallet transfer or a claim that fungible ETH has individually traceable provenance. Gas, excess transaction value, the launch purchase, and unrelated transfers are excluded from the reported buyback input.

For example, [the first creator-fee claim](https://robinhoodchain.blockscout.com/tx/0x35a36ee062532d16b8dfceb87e80feece3937e79ad538eec8690338aa3599f57) pays 0.638483419832425069 ETH at block 57046148, before [the first registered purchase](https://robinhoodchain.blockscout.com/tx/0x00948bd214f004b1f9f8f2d0d8b84b009e3fff718b3a2b28f57195c8e2345052) spends 0.297 ETH at block 57046300. Its raw Swap log is included in `fixtures.json`.

Creator fees are counted once when distributed from the curve/pool. Claims do not add revenue again. Subsequent revenue-funded purchases enter the buyback series when executed, without claiming they occurred on the same day as the revenue receipt.

LP funding is excluded from holder revenue and is not deducted from protocol revenue. `fetchRouteAccounting` retains a separate `dailyCapitalAllocation` balance with a `Liquidity Funding` breakdown: the full emitted `lpBudget` from successful September 11 and Ramp manager cycles, including both assets and carry-forward balances, not exact deposited value. It excludes dedicated buybacks and does not recount later spending of those balances. The default adapter fetch omits this balance because DefiLlama has no supported capital-allocation dimension. Publishing it or a combined "Buybacks + LP funding" chart requires separate maintainer-supported dashboard/schema work; it must not be relabeled as holder income.

## RPC rate limits during validation

The SDK expands multi-address log queries into parallel requests, while the CLI tests two hourly slices concurrently. For public Robinhood endpoints, reduce SDK concurrency before running the existing test (PowerShell):

```powershell
$env:ROBINHOOD_RPC_GET_LOGS_CONCURRENCY_LIMIT = '1'
$env:ROBINHOOD_RPC_MAX_PARALLEL = '1'
npm test -- aggregators route
```

These are runner settings, not adapter accounting changes. HTTP 429 indicates provider throttling; HTTP 403 indicates denied access. Lower concurrency cannot guarantee public-provider availability. If errors persist, configure `ROBINHOOD_RPC` and `ROBINHOOD_ARCHIVAL_RPC` with an authorized endpoint through the runner's secret environment. Do not commit credential URLs. Failed log requests must still fail the run rather than publish incomplete or zero totals.
