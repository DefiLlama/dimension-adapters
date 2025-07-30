import * as sdk from "@defillama/sdk";

import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('FyXg4ty4DFtijG9wF9VzRpBPW21vNwuqVVYYap5mayy7')
  },
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
});

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.BSC],
  start: 1648005393,
}

export default adapter;
