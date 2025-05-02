import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchSwapXV2Data } from "../../dexs/SwapX-v2";

const adapter: Adapter = {
  adapter: {
    [CHAIN.SONIC]: {
      fetch: (t, _, o) => fetchSwapXV2Data(t, _, o, "feesUSD"),
      start: "2024-12-23",
    },
  },
};

export default adapter;
