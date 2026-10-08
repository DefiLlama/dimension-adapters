# Adversarial second-opinion review: `lista-lisusd`

## Verdict: **do not ship**

The new holders-revenue split is not a safe approximation of the settlement
flow.  The decisive defect is that it applies `distributeRate` to *inbound*
balances and assumes every rate share is a LISTA buyback.  Lista's own
`ListaRevenueDistributor` contract says otherwise:

- non-LISTA tokens send the rate share to `autoBuybackAddress`, but LISTA
  tokens send it to `listaDistributeToAddress`, not that buyback address;
- `distributeWithCosts` and `distributeTokensWithCost` pay costs before the
  remaining balance is split; and
- the contract emits downstream `RevenueDistributed` / `RevenueDistributedWithCost`
  events with the actual settlement amounts.

Source: [ListaRevenueDistributor.sol](https://github.com/lista-dao/lista-token/blob/master/contracts/dao/ListaRevenueDistributor.sol#L17-L149).

Accordingly, retain `master`'s `dailyProtocolRevenue: dailyRevenue` until a
separate event-based implementation is proven.  Neither the submitted
subtraction nor a blind `dailyRevenue.clone(0.3)` is correct: the latter would
also allocate unrelated Ops Safe, LP, and burn flows to holders.

## Blocking findings

1. **HIGH — the stream model is false for LISTA inputs.**
   [`fees/lista-lisusd/index.ts:385`](fees/lista-lisusd/index.ts:385) and
   [`:391`](fees/lista-lisusd/index.ts:391) add LISTA-denominated
   `veListaEarlyClaimPenalty` and `veListaAutoCompoundFee` to
   `distributorRevenue`; [`:405`](fees/lista-lisusd/index.ts:405) calls their
   rate share `LISTA Buy Back`.  Upstream selects `listaDistributeToAddress`
   for `token == listaTokenAddress`; it does **not** send that share to
   `autoBuybackAddress`.  The comment at [`:51-54`](fees/lista-lisusd/index.ts:51)
   (“buy-back that funds veLista holders”) is therefore unsupported and, for
   those LISTA streams, contradicted by the contract.

2. **HIGH — rate times ingress is not the settled buyback amount.**
   The distributor may call its cost variants, which pay a cost first and only
   split the residue.  It can also distribute accumulated balance rather than
   the particular inbound transfer in the current adapter window.  The branch
   observes neither those calls nor their `RevenueDistributed*` events, so
   [`:379-405`](fees/lista-lisusd/index.ts:379) cannot establish the claimed
   per-stream allocation.  The proposed repair is to source actual distributor
   settlement events/transfer legs, preserve token and destination, and use
   the event's actual amount0 only after proving its target is an irrevocable
   holder-value path.

3. **HIGH — no burn has been established.**
   The supplied transaction path reaches realtimeBuyback `D08B`, but its
   receiver is configurable.  The observed transaction
   [0x8245ad…9853](https://bscscan.com/tx/0x8245ad35b77ca6a0230385eacc1535e42ee6174c80afec25c301348c8d549853)
   proves a transfer from the auto-buyback address to `D08B`; it does not prove
   `D08B -> 0x…dEaD`.  Together with the sampled no-outflow day and the large
   vault balance, this is not sufficient to call the value `HoldersRevenue`.
   The buyback contract also permits changing the receiver and emergency
   withdrawal.  Require recurring, attributable `D08B -> dead` transfers (or
   another irrevocable holder distribution) and account for their actual
   cadence; otherwise this remains protocol-controlled inventory.

4. **HIGH — silently converting a rate-read failure into zero is forbidden.**
   [`:397-403`](fees/lista-lisusd/index.ts:397) catches every
   `fromApi.call(distributeRate)` error and records zero holders revenue.  That
   masks ABI/proxy, RPC, and indexer failures as historical accounting data.
   Add an explicit, sourced deployment/start guard for the pre-contract period;
   after that guard, propagate failures and validate the returned rate is finite
   and in `[0, 1]`.  A day with unknown data must throw, not persist a zero.

5. **HIGH — required public metadata is missing.**
   The new `LISTA Buy Back` label at [`:405`](fees/lista-lisusd/index.ts:405)
   has neither `methodology.HoldersRevenue` nor a
   `breakdownMethodology.HoldersRevenue` entry at [`:457-468`](fees/lista-lisusd/index.ts:457).
   This fails the adapter label contract independently of the accounting bugs.

6. **MEDIUM — the negative-revenue result exposes a wrong allocation
   boundary.**  On the reported 2025-05-31 window, `-7.23k ProtocolRevenue +
   2.98k HoldersRevenue = -4.25k Revenue`, so the branch has merely charged
   all savings cost to protocol while retaining a positive gross holder slice.
   That is not evidence of a treasury-funded cost and is especially indefensible
   when settlement may deduct costs first.  Do not ship either proposed formula
   until actual downstream events establish which balance paid the cost.

7. **MEDIUM — `freezeLista` may overlap precisely where the new code makes an
   unproven LISTA allocation.**  Existing code records the actual
   `E415… -> dead` transfer as a `dailyFees` subtraction at
   [`:277-285`](fees/lista-lisusd/index.ts:277) and [`:345-346`](fees/lista-lisusd/index.ts:345).
   The upstream `VeListaRevenueDistributor` burns a configurable share and
   forwards the residual.  If historical `listaDistributeToAddress` is E415,
   the proposed gross LISTA rate share can describe the same ingress while
   `freezeLista` separately removes the actual burn.  This is not proved as a
   direct duplicate from the adapter alone, but it is a material unresolved
   double-count/contradictory-classification risk.  Verify historical proxy
   target and the full transfer chain before adding any split.

8. **MEDIUM — stream-selection evidence is incomplete.**
   `YieldSkimmed` has no recipient field, yet [`:384`](fees/lista-lisusd/index.ts:384)
   treats every event amount as distributor income.  The nearby comment itself
   admits this 1:1 relation is observational.  Pair the event to a same-tx,
   exact-amount transfer into `0x34B504…` (`onlyArgs: false`), or exclude it
   from the allocation.  Likewise, [`:389-392`](fees/lista-lisusd/index.ts:389)
   classify three streams as always distributor-bound without a deployment/
   migration guard.  The current zero-rate fallback only conceals that gap.

9. **MEDIUM — rate-at-window-start cannot represent an intra-window
   settlement/rate change.**  [`:398`](fees/lista-lisusd/index.ts:398) reads
   opening state.  An hourly interval containing `RateChanged`, a cost call,
   or a batched distribution is misattributed.  Settlement events are the
   correct source of truth.

10. **MEDIUM — known date-label inconsistency.**  The BNB comment says the
    new account has events from 2026-10-02 ([`:42`](fees/lista-lisusd/index.ts:42))
    but the methodology says the move was from 2026-10-03
    ([`:420`](fees/lista-lisusd/index.ts:420)).  Correct and source the date;
    it is another unsafe historical claim in the same 66-line change.

## What was and was not verified

- Two independent review lanes agreed on **request changes / architectural
  BLOCK**.  `git diff --check master -- fees/lista-lisusd/index.ts` is clean.
- I attempted the required local run and a direct repository SDK
  `getEventLogs` probe for BSC.  Both failed with `Error: No RPCs available for
  bsc`; the sandbox cannot resolve the configured public RPC host.  Therefore
  I did not treat unobserved chain state as evidence.
- The upstream source review is decisive for the flow-model findings above.
  A follow-up implementation still needs reproducible `getEventLogs` output
  for: every selected stream's ingress, `RevenueDistributed*` settlements,
  historic destination/rate changes, and `D08B -> dead` cadence.

## Maintainer recommendation

Revert commit `9e70be8` for this adapter.  If a holders-revenue feature is
still desired, submit it separately with event-based settlement accounting,
documented labels/methodology, an explicit pre-deployment guard, and several
SDK-indexer test dates (including the reported negative-revenue day and rate/
cost transition days).  Do not infer a buyback-and-burn from distributor
ingress or from a balance held in a mutable protocol-controlled vault.
