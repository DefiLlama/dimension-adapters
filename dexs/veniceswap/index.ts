import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.FINDORA]: "https://graph.findora.org/subgraphs/name/findora/venice",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "veniceFactories",
  dayData: "veniceDayData",
});

adapter.adapter.findora.start = '2023-01-30';
adapter.adapter.findora.fetch = async (timestamp: number) => {return{timestamp}}
adapter.deadFrom = '2023-09-12';

export default adapter
