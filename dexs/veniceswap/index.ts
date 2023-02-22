import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.FINDORA]: "https://graph.findora.org/subgraphs/name/findora/venice",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "veniceFactories",
  dayData: "veniceDayData",
});

adapter.adapter.findora.start = async() => 1675036800;

export default adapter
