import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

function fetch(chainId: number) {
  return async ({ endTimestamp }: FetchOptions) => {

    const resp: {
      totalFees: string;
      dailyFees: string;
    } = await fetchURL(
      `https://api.furucombo.app/v1/defillama/${chainId}/fees?timestamp=${endTimestamp}`
    );

    return {
      ...resp,
      totalRevenue: resp.totalFees,
      dailyRevenue: resp.dailyFees,
    };
  };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(1),
      start: 1661840884,
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(137),
      start: 1661844760,
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(42161),
      start: 1666339052,
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(10),
      start: 1666337829,
    },
    [CHAIN.AVAX]: {
      fetch: fetch(43114),
      start: 1666340134,
    },
    [CHAIN.METIS]: {
      fetch: fetch(1088),
      start: 1687247436,
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(250),
      start: 1677838630,
    },
    [CHAIN.BASE]: {
      fetch: fetch(8453),
      start: 1700320327,
    },
    [CHAIN.XDAI]: {
      fetch: fetch(100),
      start: 1700321230,
    },
  },
};

export default adapter;
