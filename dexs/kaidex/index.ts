import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.KARDIA]: "https://ex-graph-v3.kardiachain.io/subgraphs/name/kaidex-v3/exchange2"
}, {
  factoriesName: "factories",
  dayData: "dayData",
  totalVolume: "volumeUSD",
  dailyVolume: "volumeUSD"
});
