import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '4mih95RmBqfHYvEfqq6uGGLp1Fr3gVS3VNSEa3JVRfQK' })
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
    Fees: "All trading fees paid by users while using Raybot bot.",
    Revenue: "Trading fees are collected by Raybot protocol.",
    ProtocolRevenue: "Trading fees are collected by Raybot protocol.",
  }
};

export default adapter;
