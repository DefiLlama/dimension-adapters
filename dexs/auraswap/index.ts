import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/auraswap-dex/exchange",
}, {
  factoriesName: "factories",
  dayData: "dayData",
  dailyVolume: "volumeUSD",
  totalVolume: "volumeUSD",
});

adapters.adapter.polygon.start = 1654992851;
export default adapters;
