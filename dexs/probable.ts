import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPolymarketVolume } from "../helpers/polymarket";

const EXCHANGE_CONTRACT_ADDRESS = "0xf99f5367ce708c66f0860b77b4331301a5597c86";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955"; 

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { dailyVolume, dailyNotionalVolume } = await getPolymarketVolume({ options, exchanges: [EXCHANGE_CONTRACT_ADDRESS], currency: USDT_ADDRESS });

  return {
    dailyVolume,
    dailyFees: 0, // no fees
    dailyNotionalVolume
  };
};

const adapter: SimpleAdapter = {
  version: 1, //too slow for version 2
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-12-09",
    },
  },
};

export default adapter;