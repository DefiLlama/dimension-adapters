import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSolanaReceived } from "../../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: 'or8TBDJvuD86CUiFjFWX9oy34EmjoTtHEpPULP1JTta' })
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
    Fees: "All trading fees paid by users while using bot.",
    Revenue: "Trading fees are collected by protocol.",
    ProtocolRevenue: "Trading fees are collected by protocol.",
  },
};

export default adapter;
