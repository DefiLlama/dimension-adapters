import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";


const ENDPOINT = "https://pull.fun/api/public/defillama/fees/v2";

interface FeesV2Response {
  from: number;
  to: number;
  dailyFeesUsd: number;
  dailyRevenueUsd: number;
  breakdown: {
    gachaGrossUsd: number;
    marketplaceFeesUsd: number;
    redemptionFeesUsd: number;
    gachaBuybacksPaidUsd: number;
    gachaRepoolPaidUsd: number;
  };
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const url = `${ENDPOINT}?from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const res: FeesV2Response = await fetchURL(url);

  if (!res || typeof res.dailyFeesUsd !== "number") {
    throw new Error(`Pull.Fun: no data for ${options.dateString}`);
  }

  const dailyFeesUsd = res.breakdown.gachaGrossUsd + res.breakdown.marketplaceFeesUsd + res.breakdown.redemptionFeesUsd;
  const dailySupplySideRevenueUsd = res.breakdown.gachaBuybacksPaidUsd + res.breakdown.gachaRepoolPaidUsd;
  const dailyRevenueUsd = res.dailyRevenueUsd; // can be negative — allowNegativeValue: true handles it

  return {
    dailyFees: dailyFeesUsd,
    dailyRevenue: dailyRevenueUsd,
    dailyProtocolRevenue: dailyRevenueUsd,
    dailySupplySideRevenue: dailySupplySideRevenueUsd,
  };
};

const methodology = {
  Fees: "Gross USD value paid by users: gacha pull spend (paid pulls only — free spins excluded) plus marketplace and redemption fees.",
  Revenue:
    "Realized net revenue: gross pull spend + fees − instant buyback payouts − repool yield and draw payouts. Clamped to 0 on days where payouts exceed gross.",
  ProtocolRevenue: "Same as Revenue — 100% of net realized revenue accrues to the protocol.",
  SupplySideRevenue: "Cash paid back to users: instant buyback payouts and repool yield + 85% draw payouts to repool consignors.",
};

const breakdownMethodology = {
  Fees: {
    ["Gacha Pull Spend"]: "Total USD spent on pack pulls. Free-spin pulls excluded — no real cash moved.",
    ["Marketplace Fees"]: "Platform cut on peer-to-peer card sales.",
    ["Redemption Fees"]: "Processing + shipping fees when users redeem cards for physical delivery.",
  },
  SupplySideRevenue: {
    ["Buyback Payouts"]: "Cash paid to users who instantly sold their card back to the platform.",
    ["Repool Yield + Draw Payouts"]: "Hourly yield + 85% draw payout to users who re-listed their card in the gacha pool.",
  },
};

// v2 endpoint returns aggregate P&L (not chain-keyed).
// Single chain avoids triple-counting when DefiLlama runs fetch per chain.
const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.ARBITRUM],
  start: "2025-01-01",
  fetch,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
};

export default adapter;
