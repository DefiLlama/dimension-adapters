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

After deployment, refill Base from 2026-10-13 and Abstract from 2026-10-13. The
Abstract refill restores post-cutoff warehouse receipts only; it does not restart
the retired contracts or treat collector migration deposits as service revenue.
