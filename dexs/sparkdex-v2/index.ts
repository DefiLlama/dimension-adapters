import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.FLARE]:
    "https://api.goldsky.com/api/public/project_cly4708cqpcj601tt7gzf1jdj/subgraphs/sparkdex-v2/latest/gn",
};

export default univ2Adapter2(endpoints, {
  factoriesName: "factories",
  totalVolume: "volumeUSD",
  dayData: "factoryDaySnapshot",
  dailyVolume: "volumeUSD",
  dailyVolumeTimestampField: "timestamp",
});
