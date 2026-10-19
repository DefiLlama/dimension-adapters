# DYLI payment evidence

Base Gacha emits `Bought` for both USDC and card/prepaid purchases. USDC sales use
`onchainCost`, not arbitrary transfers into the Gacha contract. Treasury funding
therefore does not become a pack sale.

The public `https://www.dyli.io/api/public/defillama` endpoint identifies direct
Stripe-funded purchases. It retrieves the completed, live USD checkout from
Stripe and returns only the public purchase hash, block, payment reference and
amounts. Checkout IDs, customer information, signatures and credentials are not
returned. Fully refunded, disputed and unpaid purchases contribute zero Stripe
sales; partial refunds reduce the recognized goods amount.

The adapter checks every returned sale against its onchain `Bought` event,
including transaction hash, block, reference and gross amount. Other prepaid
purchases do not receive an extra sale entry, since their crypto receipts are
already counted. Buybacks and refunds remain expenses for both payment methods.

The same endpoint provides Relay origin evidence. Internal bridge receipts are
excluded only after verifying a confirmed source-chain USDC transfer or a
positive native-token transfer from a DYLI-controlled address. Gas costs alone
are not bridge funding. Customer-funded bridge payments remain eligible. Missing or inconsistent
evidence fails the fetch rather than publishing partial totals.

The source-to-deposit binding is a required guarantee of the public endpoint,
not something inferred from an arbitrary treasury outflow. The public
[bridge evidence contract](./bridge-evidence.md) documents both the deployed
matching logic and the four archived migration pairs. Source receipt checks
separately establish that DYLI funded that specific bridge.

## Fees And Revenue

Pack/card buybacks are deducted from both fees and revenue, following the
[original DYLI maintainer review](https://github.com/DefiLlama/dimension-adapters/pull/7751#pullrequestreview-4539559701).
This is also the Physical TCG treatment used in [READY Cards](../ready-cards.ts)
and [Collector Crypt](../collector-crypt/index.ts). These collectible buybacks
are not payments to liquidity providers or governance-token buybacks. They are
not reclassified as supply-side revenue or added back to gross fees in this PR.
Marketplace fees remain DYLI's 5% commission, not the seller's full sale price.
DYLI retains the counted net fees, so revenue equals fees here; negative periods
are possible when buybacks relate to purchases made in earlier periods.

After deployment, refill Base from 2026-10-13 and Abstract from 2026-10-13. The
Abstract refill restores post-cutoff warehouse receipts only; it does not restart
the retired contracts or treat collector migration deposits as service revenue.
