import { Chain } from "../../adapters/types";
import { FetchResultAggregators, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

type TChainID = {
  [j: string | Chain]: number;
};
const ChainId: TChainID = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.BSC]: 56,
  [CHAIN.XDAI]: 100,
  [CHAIN.POLYGON]: 137,
  [CHAIN.FANTOM]: 250,
  // [CHAIN.ERA]: 324,
  [CHAIN.POLYGON_ZKEVM]: 1101,
  [CHAIN.KAVA]: 2222,
  [CHAIN.KLAYTN]: 8217,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.AVAX]: 43114,
  [CHAIN.AURORA]: 1313161554,
};

const fetch = (chainId: number) => {
  return async (timestamp: number): Promise<FetchResultAggregators> => {
    const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
    const data = (
      await fetchURL(
        `https://api.plexus.app/v1/dashboard/volume?date=${dateString}`
      )
    ).data;
    const dailyVolume: number = data[chainId] || 0;
    return {
      dailyVolume: dailyVolume.toString(),
      timestamp,
    };
  };
};
const adapter: SimpleAdapter = {
  deadFrom: '2025-03-02',
  adapter: Object.keys(ChainId).reduce((acc, chain) => {
    return {
      ...acc,
      [chain]: {
        fetch: fetch(ChainId[chain]),
        start: '2023-02-01',
      },
    };
  }, {}),
};

export default adapter;
