import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getPolymarketVolume } from "../helpers/polymarket";

const EXCHANGE_CONTRACT_ADDRESS = "0xf99f5367ce708c66f0860b77b4331301a5597c86";
const USDT_ADDRESS = ADDRESSES.bsc.USDT; 

const fetch = async (options: FetchOptions) => {
  const { dailyVolume, dailyNotionalVolume } = await getPolymarketVolume({ options, exchanges: [EXCHANGE_CONTRACT_ADDRESS], currency: USDT_ADDRESS });

  return {
    dailyVolume,
    dailyFees: 0, // no fees
    dailyNotionalVolume
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: "2025-12-09",
    },
  },
};

export default adapter;