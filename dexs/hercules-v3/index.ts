// https://metisapi.0xgraph.xyz/subgraphs/name/cryptoalgebra/analytics
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.METIS]: "https://metisapi.0xgraph.xyz/subgraphs/name/cryptoalgebra/analytics"
}, {
  factoriesName: "factories",
  dayData: "algebraDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.metis.start = 1696331700;
export default adapters;
