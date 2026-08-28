import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API = "https://hub.kaito.ai/api/v1/sharing/capital/projects";

// Kaito charges a 5% fee on each sale's final raise: 2.5% in USDC + 2.5% in project tokens.
// Source: https://coinlaunch.space/events-rounds/everlyn-kaito-launchpad-ido/
const STABLECOIN_FEE_RATE = 0.025;
const TOKEN_FEE_RATE = 0.025;

const StablecoinFees = "Stablecoin Fees";
const TokenFees = "Token Fees";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  const data = await httpGet(API, { headers: { "User-Agent": "Mozilla/5.0" } });
  if (!Array.isArray(data?.projects))
    throw new Error("Kaito capital projects API response is missing the `projects` array");

  for (const project of data.projects) {
    const startMs = Number(project.start_date);
    const finalRaise = Number(project.final_raise || 0);
    if (!finalRaise || !startMs) continue;

    if (startMs >= options.startTimestamp * 1000 && startMs < options.endTimestamp * 1000) {
      const stablecoinFee = finalRaise * STABLECOIN_FEE_RATE;
      const tokenFee = finalRaise * TOKEN_FEE_RATE;
      dailyFees.addUSDValue(stablecoinFee, StablecoinFees);
      dailyFees.addUSDValue(tokenFee, TokenFees);
      // USDC fee is retained by the protocol; project-token fee is redistributed to gKAITO holders.
      dailyProtocolRevenue.addUSDValue(stablecoinFee, StablecoinFees);
      dailyHoldersRevenue.addUSDValue(tokenFee, TokenFees);
    }
  }

  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue, dailyHoldersRevenue };
};

const methodology = {
  Fees: "5% fee on each sale's final raise: 2.5% in USDC + 2.5% in project tokens (valued at the sale).",
  Revenue: "All launchpad fees collected by Kaito (2.5% USDC + 2.5% project tokens).",
  ProtocolRevenue: "The 2.5% USDC fee retained by the Kaito protocol.",
  HoldersRevenue: "The 2.5% project-token fee redistributed to the community via the gKAITO mechanism.",
};

const breakdownMethodology = {
  Fees: {
    [StablecoinFees]: "2.5% of each sale's final raise, taken in USDC.",
    [TokenFees]: "2.5% of each sale's final raise, taken in project tokens (valued at the sale).",
  },
  Revenue: {
    [StablecoinFees]: "2.5% USDC fee collected by Kaito.",
    [TokenFees]: "2.5% project-token fee collected by Kaito.",
  },
  ProtocolRevenue: {
    [StablecoinFees]: "2.5% USDC fee retained by the Kaito protocol.",
  },
  HoldersRevenue: {
    [TokenFees]: "2.5% project-token fee redistributed to the community via gKAITO.",
  },
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.BASE],
  start: '2025-07-25', 
  methodology,
  breakdownMethodology,
};

export default adapter;
