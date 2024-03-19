//  Wagmi fee
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchFee } from "../../dexs/wagmi/wagmi";

const methodology = {
  UserFees: "LPs collect 100% of the fee generated in a pool",
  Fees: "Fees generated on each swap at a rate set by the pool.",
  TotalUserFees: "Cumulative all-time Fees",
  TotalFees: "Cumulative all-time Fees",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch: fetchFee(CHAIN.ERA),
      start: 1681257600,
      meta: {
        methodology,
      },
    },
    [CHAIN.FANTOM]: {
      fetch: fetchFee(CHAIN.FANTOM),
      start: 1681257600,
      meta: {
        methodology,
      },
    },
    // [CHAIN.KAVA]: {
    //   fetch: fetchFee(CHAIN.KAVA),
    //   start: 1694476800,
    //   meta: {
    //     methodology,
    //   },
    // },
    [CHAIN.ETHEREUM]: {
      fetch: fetchFee(CHAIN.ETHEREUM),
      start: 18240112,
      meta: {
        methodology,
      },
    },
    // [CHAIN.METIS]: {
    //   fetch: fetchFee(CHAIN.METIS),
    //   start: 1702888970,
    //   meta: {
    //     methodology,
    //   },
    // },
  },
};

export default adapter;
