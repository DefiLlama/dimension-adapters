import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const endpoints = {
  [CHAIN.MANTLE]: "https://graph.fusionx.finance/subgraphs/name/fusionx/exchange-v3",
};

const adapter = univ2Adapter(endpoints, {
  factoriesName: "factories",
  dayData: "fusionXDayData",
  dailyVolume: "volumeUSD",
});

adapter.adapter.mantle.start = async () => 1689206400;

export default adapter
