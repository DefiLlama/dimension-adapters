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
    // [CHAIN.ERA]: {
    //   fetch: fetchFee(CHAIN.ERA),
    //   start: '2023-04-12',
    //   meta: {
    //     methodology,
    //   },
    // },
    [CHAIN.FANTOM]: {
      fetch: fetchFee(CHAIN.FANTOM),
      start: "2023-04-12",
      meta: {
        methodology,
      },
    },
    [CHAIN.KAVA]: {
      fetch: fetchFee(CHAIN.KAVA),
      start: "2023-09-12",
      meta: {
        methodology,
      },
    },
    [CHAIN.ETHEREUM]: {
      fetch: fetchFee(CHAIN.ETHEREUM),
      meta: {
        methodology,
      },
    },
    [CHAIN.METIS]: {
      fetch: fetchFee(CHAIN.METIS),
      start: "2023-12-18",
      meta: {
        methodology,
      },
    },
    [CHAIN.SONIC]: {
      fetch: fetchFee(CHAIN.SONIC),
      start: "2023-12-18",
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
