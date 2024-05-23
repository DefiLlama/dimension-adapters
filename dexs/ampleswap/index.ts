import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/shrinivasmani/ampleswapgraph",
};
const adapter = univ2Adapter(endpoints, {});

adapter.adapter.bsc.start = 1631404800;

export default adapter
