import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.AVAX]: "https://api.thegraph.com/subgraphs/name/ramsesexchange/pharaoh-cl-subgraph"
}, {
  factoriesName: "factories",
  dayData: "uniswapDayData",
  dailyVolume: "volumeUSD",
  totalVolume: "totalVolumeUSD",
});

adapters.adapter.avax.start = 1702339200;
export default adapters;
