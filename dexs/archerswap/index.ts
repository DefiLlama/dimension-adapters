// https://subgraph.archerswap.finance/subgraphs/name/tomdoeverything/archerswap-subgraph
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.CORE]: "https://subgraph.archerswap.finance/subgraphs/name/tomdoeverything/archerswap-subgraph",
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.core.start = async()=> 1678060800;

export default adapter
