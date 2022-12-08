import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/mejiasd3v/vapordex-avalanche"
}, {
  factoriesName: "dexAmmProtocols",
  totalVolume: "cumulativeVolumeUSD",
  dayData: "financialsDailySnapshot",
  dailyVolume: "dailyVolumeUSD",
  dailyVolumeTimestampField: "timestamp"
});

adapters.adapter.avax.start = async () => 1663545600;
export default adapters;
