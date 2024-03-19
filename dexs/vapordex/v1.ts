import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const v1 = univ2Adapter(
  {
    [CHAIN.AVAX]:
      "https://api.thegraph.com/subgraphs/name/mejiasd3v/vapordex-avalanche",
  },
  {
    factoriesName: "dexAmmProtocols",
    totalVolume: "cumulativeVolumeUSD",
    dayData: "financialsDailySnapshot",
    dailyVolume: "dailyVolumeUSD",
    dailyVolumeTimestampField: "timestamp",
  }
);

v1.adapter.avax.start = 1663545600;
export default v1.adapter;
