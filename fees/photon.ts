import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSolanaReceived } from "../helpers/token";

// https://dune.com/adam_tehc/photon
const fetch: any = async (options: FetchOptions) => {
  const dailyFees = await getSolanaReceived({ options, target: 'AVUCZyuT35YSuj4RH7fwiyPu82Djn2Hfg7y2ND2XcnZH' })
  return { dailyFees, dailyRevenue: dailyFees, }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetch,
    },
  },
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "All trading fees paid by users.",
    Revenue: "Trading fees are collected by Photon protocol."
  }
};

export default adapter;