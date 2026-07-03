import { FetchOptions, FetchResultV2, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const API = "https://hub.kaito.ai/api/v1/sharing/capital/projects";

const StablecoinFees = "Stablecoin Fees";
const TokenFees = "Token Fees";

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyFees = options.createBalances();

  const { projects = [] } = await httpGet(API, { headers: { "User-Agent": "Mozilla/5.0" } });

  for (const project of projects) {
    const startMs = Number(project.start_date);          
    const finalRaise = Number(project.final_raise || 0); 
    if (!finalRaise || !startMs) continue;

    if (startMs >= options.startTimestamp * 1000 && startMs < options.endTimestamp * 1000) {
      dailyFees.addUSDValue(finalRaise * 0.025, StablecoinFees); 
      dailyFees.addUSDValue(finalRaise * 0.025, TokenFees);      
    }
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const methodology = {
  Fees: "5% fee on each sale's final raise: 2.5% in USDC + 2.5% in project tokens (valued at the sale).",
  Revenue: "All launchpad fees are collected by Kaito.",
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
