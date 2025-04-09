import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDune } from "../helpers/dune";

interface IResponse {
  fees: number;
}

const fetch = async (options: FetchOptions) => {
  const response: IResponse[] = (await queryDune("4965118", { start: options.startTimestamp, chain: options.chain, end: options.endTimestamp }));

  const dailyFees = response.reduce((acc, item) => acc + item.fees, 0)

  return {
    dailyFees,
    dailySupplySideRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2023-04-30",
    },
    [CHAIN.ARBITRUM]: {
      fetch,
      start: "2023-04-30",
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: "2023-04-30",
    },
    [CHAIN.POLYGON]: {
      fetch,
      start: "2023-04-30",
    },
  },
  isExpensiveAdapter: true,
};

export default adapter;
