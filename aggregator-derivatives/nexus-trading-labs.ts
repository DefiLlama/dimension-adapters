import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const ORDERLY_API = "https://api.orderly.org/v1/public/futures";

const fetchVolume = async ({ startOfDay }: FetchOptions) => {
  const data = await httpGet(ORDERLY_API);

  const markets = data?.data?.rows || [];

  const dailyVolume = markets.reduce((sum: number, market: any) => {
    return sum + (Number(market["24h_amount"]) || 0);
  }, 0);

  return {
    dailyVolume,
    timestamp: startOfDay,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: fetchVolume,
      start: "2024-01-01",
      meta: {
        methodology: {
          Volume:
            "Sum of 24h notional trading volume across all perpetual markets on Nexus Trading Labs, powered by Orderly Network on Arbitrum.",
        },
      },
    },
  },
};

export default adapter;
