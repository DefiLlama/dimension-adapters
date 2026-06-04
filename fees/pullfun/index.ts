import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const ENDPOINT = "https://pull.fun/api/public/defillama/fees/v2";

interface FeesV2Response {
  from: number;
  to: number;
  dailyVolumeUsd: number;
  dailyFeesUsd: number;
  dailyRevenueUsd: number;
  dailyUserFeesUsd: number;
  dailyProtocolRevenueUsd: number;
  breakdown: {
    gachaGrossUsd: number;
    [packTier: string]: number; // gachaPack50Usd, gachaPack100Usd, etc. (dynamic)
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

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();

  // Volume = gross gacha pull spend only (no netting).
  dailyVolume.addUSDValue(res.dailyVolumeUsd, "Gacha Volume");

  // Per-tier pack spend (dynamic keys: gachaPack50Usd, gachaPack100Usd, …).
  // Falls back to gachaGrossUsd when tier keys are absent.
  const tierKeys = Object.keys(res.breakdown).filter(k => /^gachaPack\d+Usd$/.test(k));
  if (tierKeys.length > 0) {
    for (const key of tierKeys) {
      const tierLabel = `Gacha $${key.replace("gachaPack", "").replace("Usd", "")} Pack Sales`;
      dailyFees.addUSDValue(res.breakdown[key], tierLabel);
    }
  } else {
    dailyFees.addUSDValue(res.breakdown.gachaGrossUsd, "Gacha Pack Sales");
  }

  dailyFees.addUSDValue(res.breakdown.marketplaceFeesUsd, "Marketplace Fees");
  dailyFees.addUSDValue(res.breakdown.redemptionFeesUsd, "Redemption Fees");

  // Cash paid back to users — negative line items reduce net fees/revenue.
  dailyFees.addUSDValue(-res.breakdown.gachaBuybacksPaidUsd, "Pack Buyback Payouts");
  dailyFees.addUSDValue(-res.breakdown.gachaRepoolPaidUsd, "Repool Yield + Draw Payouts");

  // All four net dimensions are equal (Collector Crypt convention).
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue: dailyFees,
    dailyUserFees: dailyFees,
    dailyProtocolRevenue: dailyFees,
  };
};

const methodology = {
  Volume: "Gross gacha pull spend (sum of all pack sales, no netting).",
  Fees: "Net realized revenue: gross gacha + marketplace + redemption fees minus buyback payouts and repool yield/draw payouts. Can be negative on heavy-buyback days.",
  Revenue: "Same as Fees.",
  UserFees: "Same as Fees — all fees originate from user activity.",
  ProtocolRevenue: "Same as Fees — 100% of net revenue accrues to the protocol.",
};

const breakdownMethodology = {
  Fees: {
    ["Gacha $50 Pack Sales"]: "Pull spend on $50 packs.",
    ["Gacha $100 Pack Sales"]: "Pull spend on $100 packs.",
    ["Gacha $250 Pack Sales"]: "Pull spend on $250 packs.",
    ["Gacha $1000 Pack Sales"]: "Pull spend on $1000 packs.",
    ["Marketplace Fees"]: "Platform cut on peer-to-peer card sales.",
    ["Redemption Fees"]: "Processing + shipping fees when users redeem cards for physical delivery.",
    ["Pack Buyback Payouts"]: "Cash paid to users who instantly sold their card back to the platform.",
    ["Repool Yield + Draw Payouts"]: "Hourly yield + 85% draw payout to users who re-listed their card in the gacha pool.",
  },
};

// v2 endpoint returns aggregate P&L (not chain-keyed).
// Single chain entry avoids triple-counting when DefiLlama runs fetch per chain.
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
