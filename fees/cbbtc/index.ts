import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {

  return {
    dailyFees: 0,
    dailyRevenue: 0,
  };
};

const methodology = {
  Fees: "No fees are charged when minting and redeeming cbBTC.",
  Revenue: "No revenue."
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ETHEREUM, CHAIN.ARBITRUM, CHAIN.BASE, CHAIN.SOLANA],
  start: "2024-08-21",
  methodology,
};

export default adapter;
