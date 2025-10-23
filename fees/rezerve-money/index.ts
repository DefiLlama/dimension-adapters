import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchYieldFromPools } from "./yield";

const fetch = async (options: FetchOptions) => {
  const dailyProtocolRevenue = options.createBalances();

  await fetchYieldFromPools(dailyProtocolRevenue, options); 

  return {
    dailyProtocolRevenue
  };
};

const methodology = {
  ProtocolRevenue: "Yield generated from yield-bearing tokens in protocol-owned pools",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: "2025-06-13",
    },
    [CHAIN.SONIC]: {
      fetch,
      start: "2025-06-13",
    },
  },
  methodology,
  version: 2,
};

export default adapter;
