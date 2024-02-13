import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.XDC]: "https://xinfin-graph.fathom.fi/subgraphs/name/dex-subgraph"
}, {
    factoriesName: "fathomSwapFactories",
    dayData: "fathomSwapDayData",
});


adapters.adapter.xdc.start = 1682640000;
export default adapters;
