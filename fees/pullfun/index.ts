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

const fetch = async (options: FetchOptions) => {
  const url = `${ENDPOINT}?from=${options.startTimestamp}&to=${options.endTimestamp}`;
  const res: FeesV2Response = await fetchURL(url);

  if (!res || typeof res.dailyFeesUsd !== "number") {
    throw new Error(`Pull.Fun: no data for ${options.dateString}`);
  }

  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  // Volume = gross gacha pull spend only (no netting).
  dailyVolume.addUSDValue(res.dailyVolumeUsd);

  // Gross inflows: per-tier pack spend + platform fees.
  // Dynamic tier keys: gachaPack50Usd, gachaPack100Usd, etc.
  // Falls back to gachaGrossUsd when tier keys are absent.
  const tierKeys = Object.keys(res.breakdown).filter(k => /^gachaPack\d+Usd$/.test(k));
  if (tierKeys.length > 0) {
    for (const key of tierKeys) {
      const tierLabel = `Gacha $${key.replace("gachaPack", "").replace("Usd", "")} Pack Sales`;
      dailyRevenue.addUSDValue(res.breakdown[key], tierLabel);
      dailyFees.addUSDValue(res.breakdown[key], tierLabel);
    }
  } else {
    dailyRevenue.addUSDValue(res.breakdown.gachaGrossUsd, "Gacha Non-tier Pack Sales");
    dailyFees.addUSDValue(res.breakdown.gachaGrossUsd, "Gacha Non-tier Pack Sales");
  }

  dailyRevenue.addUSDValue(res.breakdown.marketplaceFeesUsd, "Marketplace Fees");
  dailyRevenue.addUSDValue(res.breakdown.redemptionFeesUsd, "Redemption Fees");

  dailyFees.addUSDValue(res.breakdown.marketplaceFeesUsd, "Marketplace Fees");
  dailyFees.addUSDValue(res.breakdown.redemptionFeesUsd, "Redemption Fees");

  // Buybacks and repool payouts subtracted directly from fees (Collector Crypt convention)
  dailyRevenue.addUSDValue(-res.breakdown.gachaBuybacksPaidUsd, "Pack Buyback Payouts");
  dailyFees.addUSDValue(-res.breakdown.gachaBuybacksPaidUsd, "Pack Buyback Payouts");

  dailySupplySideRevenue.addUSDValue(res.breakdown.gachaRepoolPaidUsd, "Repool Yield + Draw Payouts to consignors");
  dailyRevenue.addUSDValue(-res.breakdown.gachaRepoolPaidUsd, "Repool Yield + Draw Payouts to consignors");

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailyUserFees: dailyFees,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Volume: "Gross gacha pull spend (sum of all pack sales, no netting).",
  Fees: "Net fees (adapter-level): gacha pull spend (paid pulls only — free spins excluded) plus marketplace and redemption fees, minus card buyback payouts.Can be negative on heavy-buyback days.",
  Revenue: "The sum of gacha pack sales, marketplace fees, and redemption fees minus buyback and repool payouts.",
  UserFees: "Same as Fees — all fees originate from user pull spend and marketplace/redemption activity.",
  ProtocolRevenue: "The sum of gacha pack sales, marketplace fees, and redemption fees minus buyback and repool payouts.",
  SupplySideRevenue: "The sum of repool yield and draw payouts to consignors.",
};

const breakdownMethodology = {
  Fees: {
    ["Gacha Non-tier Pack Sales"]: "Total gacha pull spend across all pack tiers.",
    ["Gacha $50 Pack Sales"]: "Pull spend on $50 packs.",
    ["Gacha $100 Pack Sales"]: "Pull spend on $100 packs.",
    ["Gacha $250 Pack Sales"]: "Pull spend on $250 packs.",
    ["Gacha $1000 Pack Sales"]: "Pull spend on $1000 packs.",
    ["Marketplace Fees"]: "Platform cut on peer-to-peer card sales.",
    ["Redemption Fees"]: "Processing + shipping fees when users redeem cards for physical delivery.",
    ["Pack Buyback Payouts"]: "Cash paid to users who instantly sold their card back to the platform (subtracted).",
  },
  SupplySideRevenue: {
    ["Repool Yield + Draw Payouts to consignors"]: "Hourly yield + 85% draw payout to repool consignors.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.OFF_CHAIN],
  start: "2026-04-21",
  fetch,
  methodology,
  breakdownMethodology,
  allowNegativeValue: true,
};

export default adapter;
