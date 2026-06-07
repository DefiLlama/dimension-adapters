import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getPrices } from "../../utils/prices";

// Venice (VVV) — private/uncensored AI platform on Base.
//
// Venice runs a programmatic buy-and-burn: every NEW subscription buys a fixed USD amount of VVV
// from the open market and burns it (sends it to the null address), scaled by plan —
// $2 Pro / $5 Pro+ / $10 Max. The buy-and-burn is funded from total revenue, including off-chain
// (fiat / card) payments.
//
// This adapter reports Fees, Revenue, and HoldersRevenue all equal to the on-chain buy-and-burn.
// It deliberately does NOT extrapolate the burn to gross subscription revenue, because the burn is
// a poor proxy for it:
//   - The burn fires once at signup; it does NOT recur on the 2nd month or on renewals, so it
//     cannot represent ongoing subscription revenue.
//   - It is a FLAT per-plan amount ($2 / $5 / $10) regardless of billing period, so a monthly
//     ($18/mo) and an annual (~10% off, 12 months prepaid) signup burn the same amount and are
//     indistinguishable on-chain.
//   - Gross subscription payments settle custodially (Coinbase Commerce / Coinbase Developer
//     Platform) and are not observable on-chain.
//
//   Plan   Buy-burn / new signup
//   Pro    $2  (was $1 at launch)
//   Pro+   $5
//   Max    $10
//
// History (verified against venice.ai/token/burns and Venice announcements):
//   - 2026-04-15: programmatic buy-and-burn launched at a flat $1 per new Pro subscription.
//   - ~2026-04-27: moved to tiered amounts — $2 Pro, $5 Pro+, $10 Max (per the new 4-tier pricing).
//   - 2025-11-08: discretionary revenue buybacks began — VVV is accumulated via recurring ~$60–$100
//     DCA buys and then burned to 0x0 in one bulk transfer roughly monthly (so it lands on-chain as
//     a single large burn, ~$200k+, rather than daily).
// The one-time unclaimed-airdrop burn (~33M VVV, 2025-03-12) predates the program and is excluded
// by the start date.
//
// Not captured: direct API credit / DIEM purchases (pay-as-you-go top-ups) do NOT trigger a
// programmatic burn. When bought with cards or Stripe crypto, they settle off-chain or into
// Stripe/Bridge custody (Venice receives fiat), with no Venice-attributable on-chain footprint.
//
// Each burn is classified by its USD value into the plan that triggered it, for the HoldersRevenue
// breakdown; larger bulk burns are attributed to discretionary revenue buybacks.
const VVV = "0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const DISCRETIONARY = "Discretionary revenue buy-back";

// Plans, matched to a burn by its USD value (pegged at ~$2 / $5 / $10; legacy $1 Pro burns fall
// into Pro). Anything materially larger than the Max burn is a discretionary revenue buyback.
const PLANS = [
  { label: "Pro subscription buy-back", burnMax: 3.5 },   // $1 (legacy) + $2 Pro
  { label: "Pro+ subscription buy-back", burnMax: 7.5 },  // $5 Pro+
  { label: "Max subscription buy-back", burnMax: 20 },    // $10 Max
];

const fetch = async (options: FetchOptions) => {
  const dailyHoldersRevenue = options.createBalances();

  // VVV bought back from the open market and burned (sent to the null address).
  const logs = await options.getLogs({
    target: VVV,
    eventAbi: "event Transfer(address indexed from, address indexed to, uint256 value)",
    topics: [TRANSFER_TOPIC, null as any, "0x".concat("0".repeat(64))],
  });

  const priceKey = `${CHAIN.BASE}:${VVV.toLowerCase()}`;
  const price = (await getPrices([priceKey], options.toTimestamp))[priceKey];

  logs.forEach((log: any) => {
    let label = DISCRETIONARY;
    if (price?.price && price?.decimals !== undefined) {
      const burnUsd = (Number(log.value) / 10 ** price.decimals) * price.price;
      label = PLANS.find((p) => burnUsd < p.burnMax)?.label ?? DISCRETIONARY;
    }
    dailyHoldersRevenue.add(VVV, log.value, label);
  });

  return { 
    dailyFees: dailyHoldersRevenue,
    dailyRevenue: dailyHoldersRevenue,
    dailyHoldersRevenue
  };
};

const NOT_INCLUDED = "Excludes Venice's subscription, API, and credit/DIEM revenue, which settle off-chain (card / Coinbase Commerce / Stripe-Bridge) with no on-chain footprint.";

const methodology = {
  Fees: `${NOT_INCLUDED} Includes only the on-chain VVV buy-and-burn (USD value of VVV burned), which equals HoldersRevenue.`,
  Revenue: `${NOT_INCLUDED} Includes only the VVV buy-and-burn (= HoldersRevenue).`,
  HoldersRevenue: "USD value of VVV bought back and burned: programmatic per-subscription burns ($2 Pro / $5 Pro+ / $10 Max) plus discretionary revenue buybacks.",
};

const buybackBreakdown = {
  "Pro subscription buy-back": "~$2 of VVV bought back and burned per new Pro signup ($1 at launch).",
  "Pro+ subscription buy-back": "~$5 of VVV bought back and burned per new Pro+ signup.",
  "Max subscription buy-back": "~$10 of VVV bought back and burned per new Max signup.",
  [DISCRETIONARY]: "VVV bought back and burned in bulk (~monthly) from accumulated platform revenue, not tied to a single subscription.",
};

const breakdownMethodology = {
  Fees: buybackBreakdown,
  Revenue: buybackBreakdown,
  HoldersRevenue: buybackBreakdown,
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.BASE],
  start: "2025-11-08",
  methodology,
  breakdownMethodology,
};

export default adapter;
