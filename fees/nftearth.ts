import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { Chain } from "../adapters/types";

const fetch = (_chain: Chain) => {
  return async (timestamp: number): Promise<FetchResultFees> => {
    return { dailyFees: '0', dailyRevenue: '0', timestamp }
  }
}

const adapter: Adapter = {
  deadFrom: '2024-01-01',
  adapter: {
    [CHAIN.OPTIMISM]: {
      fetch: fetch(CHAIN.OPTIMISM),
      start: '2023-01-30',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(CHAIN.ARBITRUM),
      start: '2023-02-14',
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(CHAIN.POLYGON),
      start: '2023-01-30',
    },
  }
}

export default adapter;
