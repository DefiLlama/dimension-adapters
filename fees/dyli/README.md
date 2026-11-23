# DYLI Volume And Net Fees

DYLI reports two independent calculations. **Volume** is gross tracked payment
and trading turnover, including purchases and later sell-backs to DYLI. **Fees
and revenue** are receipts retained after sell-backs and refunds, plus the
marketplace/P2P commissions and existing service receipts. Neither figure is
net profit: physical-card procurement, grading, shipping and vaulting costs
paid offchain remain undisclosed in the income statement.

## Formulas

For Base, let:

- `P` = crypto pack payments plus verified, non-refunded Stripe goods amounts.
- `B` = USDC paid for settled card sell-backs to DYLI, across both settlement paths.
- `R` = onchain pack refunds, including expired-purchase cancellations.
- `M` = full settled secondary marketplace and P2P payment volume.
- `C` = DYLI's marketplace/P2P commissions, not seller proceeds.
- `A` = completed cash auctions' winning bids plus buyer premiums.
- `E` = earned auction premiums plus the hammer price only when DYLI owns the lot.
- `S` = existing tracked mint/platform/vault/batchRedeem receipts, excluding
  internal sweeps, treasury bridges and settlements already counted in `C` or `E`;
  this also includes nonrefundable cash-auction launch charges paid to the treasury.

```text
Trading/payment volume = P + B + M + A + S
Net fees               = P - B - R + C + E + S
Retained revenue       = net fees, before undisclosed offchain costs
```

A $100 purchase followed by an $80 sell-back means $180 of trading turnover and
$20 of net pack fees. Sales-only GMV would be $100, not $180. A $250 purchase and
$1,500 sell-back mean $1,750 turnover and -$1,250 net pack fees; no floor is applied.
A $100 marketplace sale contributes $100 of volume and its $5 commission to fees.

The existing service/payment receipt paths remain included in `S`: the total
is therefore **not pack-only volume or pure merchandise GMV**. A buy-side eBay
earnings transfer remains a tracked earned receipt, not a claim that its value
reveals the full underlying eBay sale price. The same limitation applies to
prepaid crypto receipts: do not add an unverified prepaid opening a second time.
The source-chain verifier also recognizes Avalanche USDC/native funding so
verified treasury bridges from Avalanche are excluded rather than counted as sales.

## Onchain Evidence

| Flow | Contract / event | Treatment |
| --- | --- | --- |
| Pack payment | [Base Gacha](https://basescan.org/address/0x2f28a653fFfFe4698838BC695c1354023C7b46D2#code), `Bought.onchainCost` | Add actual USDC purchase cost, not arbitrary contract funding. |
| Direct sell-back | Same Gacha, `Finalized.totalBuyBack` | Add to volume and subtract from net pack fees. |
| Refund | Same Gacha, `Finalized.totalRefund` or `ExpiredBuyCancelled.refund` | Subtract from net pack fees, never add a second trade to volume. |
| Claim then sell | [Claim-buyback helper](https://basescan.org/address/0x4E86614c26f22f3bDDd93AEeE07479159159Fa54#code), `BuybackSettled.payout` | Add the aggregate quote payout to volume and subtract it from net pack fees. |
| Claim / restock | NFT delivery, `ClaimBought`, inventory events | Do not count the initial delivery again; per-card helper events and restocking are not additional payments. |

The helper's `sell` method returns the selected ERC1155 cards to DYLI and calls
`USDC.transferFrom(treasury, seller, total)` atomically before emitting
`BuybackSettled`. A failed NFT or cash transfer reverts the transaction. The cash
comes from the treasury, **not from the Gacha address**, which is why the old
vending-machine-only outflow query missed this path. The first live helper sale
was [17.50 USDC on November 5, 2026](https://basescan.org/tx/0xfea41735367a7d5e0fc22ad07ca7b0480747cd5a206ff5f5fa8d227c1e644eba).
Count the aggregate quote once, not both `BuybackSettled` and its `ClaimBought`
events, and do not count a raw treasury transfer as an additional sell-back.

## Stripe

`Bought.paymentMode = 1` covers both Stripe and prepaid crypto and is not itself
proof of a card payment. The existing public
[payment-evidence endpoint](https://www.dyli.io/api/public/defillama?chainId=8453&fromBlock=52573327&toBlock=52616526)
verifies direct live USD Stripe checkouts. Each returned purchase must match
the onchain transaction hash, block, payment reference and gross amount; its
recognized amount is bounded by that gross amount and is counted only once.
Refunded, disputed, unpaid and test card payments are not recognized as income;
partial Stripe refunds reduce the recognized goods amount. Provider failures
fail the fetch rather than publish partial totals. No customer identifiers,
Stripe checkout/payment IDs or credentials are exposed.

A later card sell-back is a separate onchain trade even if the purchase used
Stripe. Its payout is counted through `Finalized` or `BuybackSettled`, regardless
of payment method. Offchain purchase types not covered by the evidence endpoint
are not guessed from `paymentMode`; their inclusion needs verified evidence.

## Cash Auctions

The [Base cash-auction contract](https://basescan.org/address/0xED6947F6fF6B0C7e861891D3F5F4cAD4D8667834#code)
was deployed in [this transaction](https://basescan.org/tx/0x61b05b139931150fa32b65fd0eb16fc087c18712e200d9b7fde9539bde2afe48).
The receipt places deployment at block 61,267,185 on November 23, 2026 at
14:23:32 UTC, so it contributes no auction sales to the November 16-22 audit.
Onchain checks confirm its treasury is `0xfb`, its payment token is native Base
USDC and its item collection is DYLI core. The inspected runtime hash is
`0xfb9d16f2bdc57158ca8d4b99c4f7f290412aaee1964e325181c2e63fb6b17fa5`.

Only a positive `Settled.amount` for an external winning bidder is a cash sale.
The adapter reads `auctions(id)` at the window's closing block, verifies the
settlement against that lot and calls the contract's `premium(amount,premiumBps)`
function with the lot's saved rate. It does not assume every product uses the
default 10% or reimplement the contract's round-up-to-a-cent rule.

- Volume is the winning bid plus its buyer premium, counted once at settlement.
- For an external seller, only the buyer premium is DYLI income; the hammer price
  belongs to the seller. For a DYLI-owned lot, DYLI also earns the hammer price,
  before undisclosed physical-card costs.
- The auction address is an internal settlement address. Transfers from it to
  the treasury are not counted again as platform-wallet service receipts.
- Nonrefundable cash launch fees paid directly to the treasury remain service
  receipts. Losing bids, refundable escrow, cancelled lots, no-bid returns,
  DYLI-funded bids and NFT custody transfers do not become auction sales.
- Diamond auctions and any offchain-only cash flows have no assumed USD value.
  Direct Stripe bidding is not part of this cash contract; verified Stripe pack
  purchases remain covered by the separate purchase-evidence path.

For example, a third-party lot with a $100 hammer price and $10 premium adds $110
of volume and $10 of fees. If DYLI is the seller, the same $110 is earned by DYLI,
before card costs. Merely escrowing a $110 bid does not yet add either figure.

## November 16-22 Reconciliation

A fresh Base-chain replay for November 16 at 00:00 UTC through November 23 at
00:00 UTC covers blocks 57,984,122 through 61,008,121 inclusive. This is not a
restatement of the dashboard's previously stored, rounded daily values.

| Component | USD |
| --- | ---: |
| Actual crypto pack payments | 49,891.20 |
| Verified direct Stripe goods receipts (19 purchases) | 7,084.00 |
| Sell-backs to DYLI (1,164 quotes, 1,948 cards) | 41,034.32 |
| Pack refunds | 7.00 |
| Pack trading turnover: purchases plus sell-backs | 98,009.52 |
| Net pack fees: purchases minus sell-backs and refunds | 15,933.88 |
| Full secondary marketplace/P2P volume | 4,697.82 |
| Marketplace/P2P commissions | 247.366000 |
| Existing service/payment receipts | 5,392.688663 |
| **Total tracked turnover** | **108,100.028663** |
| **Total net fees / retained revenue** | **21,573.934663** |

All helper `BuybackSettled` payouts sum to the same amount as their per-card
`ClaimBought` events; only the aggregate quotes enter either metric. Thirteen
sampled helper settlements were also checked against their actual USDC treasury
payments, including the [first](https://basescan.org/tx/0x3f214c51740c2d7085e126b5ba8ee3d9b80ab04d40b67bfd2d5b82530c39ee5f)
and [last](https://basescan.org/tx/0x3a120823816366dba8a231351a46b8a4825f3e5576738e44ea03638776acf277)
settlement in the window. Each Stripe receipt matched its onchain `Bought` event.
The whole adapter was then run against the actual card, incoming-payment and
market/P2P logs, with source receipts checked for internal bridges.

This correction restores the missing treasury-funded sell-back path; it does
not multiply volume by an assumed margin or infer unknown offchain sales.

## Reference Patterns

- [Gacha TCG volume](../../dexs/gacha-tcg/index.ts) adds pack purchases and card
  buybacks as distinct trading legs. See the [Base migration / methodology PR](https://github.com/DefiLlama/dimension-adapters/pull/11217).
- [Gacha TCG fees](../gacha-tcg/index.ts) and [Collector Crypt](../collector-crypt/index.ts)
  net card buybacks from fees. This is not governance-token buyback/holder revenue.
- [Fees guidelines](../AGENTS.md#buybacks-and-the-tcg-pattern) explicitly require
  collectible buybacks to be deducted from fees, not supplied as supplier revenue.
- [The original DYLI maintainer review](https://github.com/DefiLlama/dimension-adapters/pull/7751#pullrequestreview-4539559701)
  also requested subtracting card buybacks from fees.

## History And Refill

Contract starts and the October 13, 2026 migration cutoff are unchanged. Base
settlement events separate sell-backs from refunds from that cutoff onward;
helper events begin with its November 5 deployment history. The older Abstract
outflow method remains unchanged because it does not prove which historical
payments were refunds versus sell-backs; this PR does not relabel those as trades.
Abstract warehouse receipts after migration also remain unchanged.

Refill Base volume from October 13, 2026 and Base fees/revenue from November 5,
2026 to restore missing helper settlements. Fee deductions now net under the
existing `Card Sales` label instead of a standalone negative `Card Buyback Spends`
row, so regenerate fee breakdowns from the original October 5, 2025 start on both
chains. This historical label refill does not change the old Abstract totals.
Refill auction data from the cash contract's November 23, 2026 deployment history.
The existing DYLI listing already displays `dailyVolume` from the fees adapter;
no new listing, duplicate volume adapter or server-side slug is required.
