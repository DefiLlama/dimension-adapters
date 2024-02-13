// https://subgraph.archerswap.finance/subgraphs/name/tomdoeverything/archerswap-subgraph
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import disabledAdapter from "../../helpers/disabledAdapter";

const endpoints = {
  [CHAIN.CORE]: "https://subgraph.archerswap.finance/subgraphs/name/archerswap-subgraph",
};

const adapter = univ2Adapter(endpoints, {});

adapter.adapter.core.start = 1678060800;
adapter.adapter.core.fetch = async (timestamp: number) => {
  return {
    dailyVolume: 0,
    timestamp,
  }
}
adapter.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;

export default adapter
