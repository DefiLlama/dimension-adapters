import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const ORDERLY_API = "https://api.orderly.org/v1/public/futures";

const fetchVolume = async ({ startOfDay }: FetchOptions) => {
  const response = await fetch(ORDERLY_API);
  const data = await response.json();

  const markets = data?.data?.rows || [];

  const dailyVolume = markets.reduce((sum: number, market: any) => {
    return sum + (market["24h_amount"] || 0);
  }, 0);

  const dailyOpenInterest = markets.reduce((sum: number, market: any) => {
    return sum + (market.open_interest || 0);
  }, 0);

  return {
    dailyVolume: dailyVolume.toString(),
    dailyOpenInterest: dailyOpenInterest.toString(),
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
          OpenInterest:
            "Total open interest across all perpetual markets on Nexus Trading Labs.",
        },
      },
    },
  },
};

export default adapter;
