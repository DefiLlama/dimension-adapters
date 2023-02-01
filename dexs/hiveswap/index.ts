import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.MAP]: "https://makalu-graph.maplabs.io/subgraphs/name/map/hiveswap2",
};

const adapter = univ2Adapter(endpoints, {});

// adapter.adapter.bsc.start = async()=>1650243600

export default adapter
