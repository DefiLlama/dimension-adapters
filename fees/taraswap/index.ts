//  Wagmi fee
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchFee } from "../../dexs/taraswap/logic";

const methodology = {
  UserFees: "LPs collect 100% of the fee generated in a pool",
  Fees: "Fees generated on each swap at a rate set by the pool.",
  TotalUserFees: "Cumulative all-time Fees",
  TotalFees: "Cumulative all-time Fees",
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TARAXA]: {
      fetch: fetchFee(CHAIN.TARAXA),
      start: "2023-11-25",
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
