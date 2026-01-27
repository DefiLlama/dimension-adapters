import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

const fetch: any = async (_: any, _1: any, options: FetchOptions) => {
  return { dailyFees: await getSolanaReceived({ options, target: 'EaJZ8BsVJtxjQmzhaFJV5igpcbYoF9eWSycGhFqwhXU6' }) }

}

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: "All trading fees paid by users while using bot.",
    Revenue: "Trading fees are collected by Falcon Bot protocol.",
    ProtocolRevenue: "Trading fees are collected by Falcon Bot protocol.",
  }
};

export default adapter;
