import { Chain } from "../adapters/types";
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

type TChainID = {
  [j: string | Chain]: number;
};
const ChainId: TChainID = {
  [CHAIN.ETHEREUM]: 1,
  [CHAIN.BSC]: 56,
  [CHAIN.POLYGON]: 137,
  [CHAIN.FANTOM]: 250,
  [CHAIN.KAVA]: 2222,
  [CHAIN.ARBITRUM]: 42161,
  [CHAIN.AVAX]: 43114,
  [CHAIN.OPTIMISM]: 10,
  [CHAIN.KLAYTN]: 8217,
  [CHAIN.AURORA]: 1313161554,
};

const fetch = (chainId: number) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
    const data = (
      await fetchURL(
        `https://api.plexus.app/v1/dashboard/fee?date=${dateString}`
      )
    ).data;
    const dailyFee: number = data[chainId] || 0;
    return {
      timestamp,
      dailyFees: dailyFee.toString(),
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
  methodology: {
    Fees: 'Swap fees paid by users.',
  }
};

export default adapter;
