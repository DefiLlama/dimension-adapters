import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchSwapXV3Data } from "../../dexs/SwapX-algebra";

const adapter: Adapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: (t, _, o) => fetchSwapXV3Data(t, _, o, "feesUSD"),
      start: "2024-12-24",
    },
  },
};

export default adapter;
