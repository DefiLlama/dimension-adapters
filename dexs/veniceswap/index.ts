import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";
import { DISABLED_ADAPTER_KEY } from "../../adapters/types";
import disabledAdapter from "../../helpers/disabledAdapter";

const endpoints = {
  [CHAIN.FINDORA]: "https://graph.findora.org/subgraphs/name/findora/venice",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "veniceFactories",
  dayData: "veniceDayData",
});

adapter.adapter.findora.start = 1675036800;
adapter.adapter[DISABLED_ADAPTER_KEY] = disabledAdapter;

export default adapter
