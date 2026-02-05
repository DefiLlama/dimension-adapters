import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.FUNCTIONX]: "https://graph-node.functionx.io/subgraphs/name/subgraphFX2"
  },
  factoriesName: "fxswapFactories",
  dayData: "fxswapDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.FUNCTIONX],
}

export default adapter;