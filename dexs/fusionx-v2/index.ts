import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.MANTLE]: "https://graph.fusionx.finance/subgraphs/name/fusionx/exchange",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "fusionxFactories",
  dayData: "fusionxDayData",
});

adapter.adapter.mantle.start = async () => 1689206400;

export default adapter
