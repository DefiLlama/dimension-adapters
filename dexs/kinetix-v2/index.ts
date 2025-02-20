import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.KAVA]:
    "https://kava-graph-node.metavault.trade/subgraphs/name/kinetixfi/v2-subgraph",
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/55804/kinetixfi-base-v2/version/latest",
};

export default univ2Adapter2(endpoints, {
  factoriesName: "factories",
  totalVolume: "volumeUSD",
  dayData: "factoryDaySnapshot",
  dailyVolume: "volumeUSD",
  dailyVolumeTimestampField: "timestamp",
});
