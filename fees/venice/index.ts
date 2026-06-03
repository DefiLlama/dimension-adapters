import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";

// Venice (VVV) — private/uncensored AI platform on Base.
//
// Venice runs a programmatic buy-and-burn: every NEW subscription buys a fixed USD amount of VVV
// from the open market and burns it (sends it to the null address), scaled by plan —
// $2 Pro / $5 Pro+ / $10 Max. The buy-and-burn is funded from total revenue, including off-chain
// (fiat / card) payments. Gross subscription payments settle custodially (Coinbase Commerce /
// Coinbase Developer Platform) and are not observable on-chain, so the per-subscription burns are
// used to reconstruct revenue: each burn = one new signup of a known plan, so we count burns by
// plan and gross them up to the plan's monthly price.
//
//   Plan   Monthly price   Buy-burn / signup   (burn as % of price)
//   Pro    $18             $2                  11.1%
//   Pro+   $68             $5                   7.4%
//   Max    $200            $10                  5.0%
//
// Billing period: each plan can be bought monthly or annually (annual = ~10% off, i.e. 12 months
// prepaid). The buy-and-burn is a FLAT per-plan amount ($2 / $5 / $10) regardless of billing period,
// so a monthly and an annual signup are indistinguishable on-chain. To avoid overstating, each new
// signup is recognized at ONE month of the plan's standard monthly price (an annual prepayment is
// thus recognized on a monthly basis rather than as a 12x up-front spike).
//
// Metrics:
//   Fees / Revenue   = grossed-up subscription revenue = Σ (new-signup count per plan × monthly price).
//                      NOTE: burns fire on NEW signups only (not renewals), so this reflects
//                      new-subscription revenue (one month recognized per signup) and undercounts
//                      total recurring MRR and annual prepayments.
//   HoldersRevenue   = USD value of VVV bought back and burned (returned to holders).
//   ProtocolRevenue  = what Venice keeps = Revenue − HoldersRevenue. This is BEFORE compute/inference
//                      provider costs, which Venice does not disclose (no supply-side split is modeled).
//
// History (verified against venice.ai/token/burns and Venice announcements):
//   - 2026-04-15: programmatic buy-and-burn launched at a flat $1 per new Pro subscription.
//   - ~2026-04-27: moved to tiered amounts — $2 Pro, $5 Pro+, $10 Max (per the new 4-tier pricing).
//   - 2025-11-08: discretionary revenue buybacks began — VVV is accumulated via recurring ~$60–$100
//     DCA buys and then burned to 0x0 in one bulk transfer roughly monthly (so it lands on-chain as
//     a single large burn, ~$200k+, rather than daily). These are not tied to a single subscription
//     and cannot be grossed up to a plan, so the full burn value is counted as revenue → holders.
// The one-time unclaimed-airdrop burn (~33M VVV, 2025-03-12) predates the program and is excluded
// by the start date.
//
// Not captured: direct API credit / DIEM purchases (pay-as-you-go top-ups) do NOT trigger a
// programmatic burn, so they are out of scope. When bought with cards or Stripe crypto, they settle
// off-chain or into Stripe/Bridge custody (Venice receives fiat), with no Venice-attributable
// on-chain footprint, so they cannot be tracked here.
const VVV = "0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const DISCRETIONARY = "Discretionary revenue buy-back";

// Subscription plans, ordered by buy-burn size. A burn is matched to a plan by its USD value
// (burns are pegged at ~$2 / $5 / $10; legacy $1 Pro burns fall into Pro). Anything materially
// larger than the Max burn is a discretionary revenue buyback, not a single subscription.
// `price` is the standard MONTHLY price; one month is recognized per new signup (see billing note
// above). Annual signups (billed ~10% cheaper for 12 months) burn the same flat amount and are not
// distinguishable on-chain, so they are recognized at the monthly rate too.
const PLANS = [
  { label: "Pro subscriptions", burnMax: 3.5, price: 18 },   // $1 (legacy) + $2 Pro
  { label: "Pro+ subscriptions", burnMax: 7.5, price: 68 },  // $5 Pro+
  { label: "Max subscriptions", burnMax: 20, price: 200 },   // $10 Max
];

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();

  // VVV bought back from the open market and burned (sent to the null address).
  const logs = await options.getLogs({
    target: VVV,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [TRANSFER_TOPIC, null as any, "0x".concat("0".repeat(64))],
  });

  const priceKey = `${CHAIN.BASE}:${VVV.toLowerCase()}`;
  const price = (await getPrices([priceKey], options.toTimestamp))[priceKey];

  logs.forEach((log: any) => {
    // Without a VVV price we can't classify or gross up — count the raw burn as buy-back value.
    if (!price?.price || price?.decimals === undefined) {
      dailyFees.add(VVV, log.value, DISCRETIONARY);
      dailyHoldersRevenue.add(VVV, log.value, DISCRETIONARY);
      return;
    }

    const burnUsd = (Number(log.value) / 10 ** price.decimals) * price.price;
    const plan = PLANS.find((p) => burnUsd < p.burnMax);

    if (plan) {
      // New subscription: gross up to the plan price; the burn itself is the holders' share,
      // and Venice keeps the remainder (before undisclosed provider/infra costs).
      dailyFees.addUSDValue(plan.price, plan.label);
      dailyHoldersRevenue.addUSDValue(burnUsd, plan.label);
      dailyProtocolRevenue.addUSDValue(plan.price - burnUsd, plan.label);
    } else {
      // Discretionary buyback funded from accumulated revenue: full value is revenue → holders.
      dailyFees.addUSDValue(burnUsd, DISCRETIONARY);
      dailyHoldersRevenue.addUSDValue(burnUsd, DISCRETIONARY);
    }
  });

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  };
};

const methodology = {
  Fees: "Grossed-up subscription revenue. Each on-chain VVV buy-and-burn corresponds to one new subscription of a known plan ($2 Pro / $5 Pro+ / $10 Max), so burns are counted by plan and multiplied by the plan's standard monthly price (Pro $18 / Pro+ $68 / Max $200). The burn is a flat per-plan amount regardless of billing period, so monthly and annual signups are indistinguishable on-chain; each new signup is recognized at one month of its plan price (annual prepayments, ~10% cheaper for 12 months, are recognized monthly rather than as an upfront spike). Burns fire on NEW signups only, so this reflects new-subscription revenue and undercounts total recurring MRR. Includes off-chain/fiat-funded signups. Direct API credit/DIEM purchases do not trigger a burn (they settle off-chain or via Stripe/Bridge custody) and are out of scope.",
  Revenue: "Same as Fees — Venice's gross subscription revenue reconstructed from the buy-and-burn (no provider/infra cost split is modeled, as Venice does not disclose it).",
  ProtocolRevenue: "Revenue Venice keeps after the buy-and-burn (Revenue − HoldersRevenue). This is BEFORE compute/inference provider costs, which are not disclosed and not deducted here.",
  HoldersRevenue: "USD value of VVV bought back from the open market and burned, permanently removing it from supply for the benefit of holders.",
};

const planBreakdown = {
  "Pro subscriptions": "New Pro signups, derived from ~$2 buy-and-burns (legacy $1 burns included), grossed up to the $18/mo Pro price.",
  "Pro+ subscriptions": "New Pro+ signups, derived from ~$5 buy-and-burns, grossed up to the $68/mo Pro+ price.",
  "Max subscriptions": "New Max signups, derived from ~$10 buy-and-burns, grossed up to the $200/mo Max price.",
  [DISCRETIONARY]: "Discretionary revenue buybacks: VVV accumulated via recurring DCA buys and burned to 0x0 in bulk (~monthly) from the Venice buyback wallet. Not tied to a subscription, so counted at full burn value.",
};

const buybackBreakdown = {
  "Pro subscriptions": "$2 of VVV bought back and burned per new Pro signup.",
  "Pro+ subscriptions": "$5 of VVV bought back and burned per new Pro+ signup.",
  "Max subscriptions": "$10 of VVV bought back and burned per new Max signup.",
  [DISCRETIONARY]: "VVV bought back and burned in bulk (~monthly) from accumulated platform revenue.",
};

const keepBreakdown = {
  "Pro subscriptions": "Pro revenue retained by Venice after the $2 buy-and-burn ($18 − burn), before provider/infra costs.",
  "Pro+ subscriptions": "Pro+ revenue retained by Venice after the $5 buy-and-burn ($68 − burn), before provider/infra costs.",
  "Max subscriptions": "Max revenue retained by Venice after the $10 buy-and-burn ($200 − burn), before provider/infra costs.",
};

const breakdownMethodology = {
  Fees: planBreakdown,
  Revenue: planBreakdown,
  ProtocolRevenue: keepBreakdown,
  HoldersRevenue: buybackBreakdown,
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-11-08",
  methodology,
  breakdownMethodology,
};

export default adapter;
