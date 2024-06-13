import * as sdk from "@defillama/sdk";

import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('FyXg4ty4DFtijG9wF9VzRpBPW21vNwuqVVYYap5mayy7')
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});
adapters.adapter.bsc.start = 1648005393;
export default adapters;
