import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '3udvfL24waJcLhskRAsStNMoNUvtyXdxrWQz4hgi953N' })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: 'All fees paid by users for buy/sell and launch tokens.',
    Revenue: 'All fees paid by users.',
    ProtocolRevenue: 'All fees paid by users.',
  }
};

export default adapter;
