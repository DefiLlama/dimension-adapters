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
      dailyRevenue: resp.dailyFees,
      dailyFees: resp.dailyFees,
    };
  };
}

const adapter: Adapter = {
  methodology: {
    Fees: 'Fees paid by users for using Furucombo services.',
    Revenue: 'All fees are revenue.',
  },
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch(1),
      start: '2022-08-30',
    },
    [CHAIN.POLYGON]: {
      fetch: fetch(137),
      start: '2022-08-30',
    },
    [CHAIN.ARBITRUM]: {
      fetch: fetch(42161),
      start: '2022-10-21',
    },
    [CHAIN.OPTIMISM]: {
      fetch: fetch(10),
      start: '2022-10-21',
    },
    [CHAIN.AVAX]: {
      fetch: fetch(43114),
      start: '2022-10-21',
    },
    [CHAIN.METIS]: {
      fetch: fetch(1088),
      start: '2023-06-20',
    },
    [CHAIN.FANTOM]: {
      fetch: fetch(250),
      start: '2023-03-03',
    },
    [CHAIN.BASE]: {
      fetch: fetch(8453),
      start: '2023-11-18',
    },
    [CHAIN.XDAI]: {
      fetch: fetch(100),
      start: '2023-11-18',
    },
  },
};

export default adapter;
