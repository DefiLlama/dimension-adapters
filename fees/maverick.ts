//  Maverick v1 fee
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchFee } from "../dexs/maverick/maverick";

const methodology = {
  UserFees: "LPs collect 100% of the fee generated in a pool",
  Fees: "Fees generated on each swap at a rate set by the pool.",
  TotalUserFees: "Cumulative all-time Fees",
  TotalFees: "Cumulative all-time Fees",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetchFee(CHAIN.ETHEREUM),
      start: 1676851200,
      meta: {
        methodology,
      },
    },
    [CHAIN.ERA]: {
      fetch: fetchFee(CHAIN.ERA),
      start: 1681257600,
      meta: {
        methodology,
      },
    },
    [CHAIN.BSC]: {
      fetch: fetchFee(CHAIN.BSC),
      start: 29241049,
      meta: {
        methodology,
      },
    },
    [CHAIN.BASE]: {
      fetch: fetchFee(CHAIN.BASE),
      start: 1489614,
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
