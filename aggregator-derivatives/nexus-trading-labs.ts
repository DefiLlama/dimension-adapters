import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const ORDERLY_API = "https://api.orderly.org/v1/public/futures";
const BROKER_ID = "nexus_trading";

interface OrderlyMarket {
  symbol: string;
  "24h_amount": number;
  open_interest: number;
  last_funding_rate: number;
}

const fetch = async ({ startOfDay }: FetchOptions) => {
  const response = await fetch(ORDERLY_API);
  const data = await response.json();

  const markets: OrderlyMarket[] = data?.data?.rows || [];

  // Sum 24h volume across all markets (in USDC)
  const dailyVolumeUSD = markets.reduce((sum, market) => {
    return sum + (market["24h_amount"] || 0);
  }, 0);

  // Sum open interest across all markets (in USDC)
  const openInterestUSD = markets.reduce((sum, market) => {
    return sum + (market.open_interest || 0);
  }, 0);

  return {
    dailyVolume: dailyVolumeUSD.toString(),
    dailyOpenInterest: openInterestUSD.toString(),
    timestamp: startOfDay,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
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
