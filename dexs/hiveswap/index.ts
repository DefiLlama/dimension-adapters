import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.MAP]: "https://makalu-graph.maplabs.io/subgraphs/name/map/hiveswap2",
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.map.start = async () => 1657929600;

export default adapter
