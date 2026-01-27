import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
    endpoints: {
        [CHAIN.XDC]: "https://xinfin-graph.fathom.fi/subgraphs/name/dex-subgraph"
    },
    factoriesName: "fathomSwapFactories",
    dayData: "fathomSwapDayData",
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.XDC]: { fetch, start: 1682640000 },
  },
}

export default adapter;
