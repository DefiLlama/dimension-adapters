import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetchFeesSolana = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '5YET3YapxD6to6rqPqTWB3R9pSbURy6yduuUtoZkzoPX' })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchFeesSolana,
      start: '2024-09-13',
    }
  },
  isExpensiveAdapter: true
};

export default adapter;
