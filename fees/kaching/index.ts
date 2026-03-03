import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

const BASE_API_URL = "https://api.kaching.vip";

const fetch = async (_a: any, _b: any, options: FetchOptions) => { 
  const revenueResponse = await httpGet(`${BASE_API_URL}/transactions/revenue?timestamp=${options.startOfDay}`);
  
  // Revenue is in USDC
  const revenue = Number(revenueResponse.today.revenue)
  
  return {
    dailyFees: revenue,
    dailyRevenue: revenue,
  };
}

const methodology = {
  Fees: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform.",
  Revenue: "Revenue generated from lottery ticket purchases on the Kaching decentralized lottery platform.",
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.APTOS],
  start: '2025-11-11', 
  methodology,
};

export default adapter;