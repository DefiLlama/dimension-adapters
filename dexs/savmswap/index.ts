import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.SVM]: "https://subgraph.8gr.xyz/subgraphs/name/savmswap/savmswap",
  },
  hasTotalVolume: false,
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SVM],
  start: 1711411200,
}

export default adapter;
