import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '3udvfL24waJcLhskRAsStNMoNUvtyXdxrWQz4hgi953N' })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'All fees paid by users for buy/sell and launch tokens.',
    Revenue: 'All fees paid by users.',
    ProtocolRevenue: 'All fees paid by users.',
  }
};

export default adapter;
