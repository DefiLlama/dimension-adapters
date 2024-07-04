import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('HimtcQxxRnR2Uj4pq7EZQ3nUnhz8f5UJu7uax6WuYCGt'),
}, {
  factoriesName: "factories",
  dayData: "dayData",
  dailyVolume: "volumeUSD",
  totalVolume: "volumeUSD",
});

adapters.adapter.polygon.start = 1654992851;
export default adapters;
