import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.MAP]: "https://makalu-graph.maplabs.io/subgraphs/name/map/hiveswap2",
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  chains: [CHAIN.MAP],
  fetch,
  start: 1657929600,
}

export default adapter
