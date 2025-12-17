import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (_: any, _1: any, options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: '97VmzkjX9w8gMFS2RnHTSjtMEDbifGXBq9pgosFdFnM' })
  return { dailyFees, dailyRevenue: dailyFees, dailyProtocolRevenue: dailyFees }

}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "All trading fees paid by users while using TradeWiz bot.",
    Revenue: "Trading fees are collected by TradeWiz protocol.",
    ProtocolRevenue: "Trading fees are collected by TradeWiz protocol.",
  }
};

export default adapter;
