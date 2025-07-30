import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('85ZjqMyuYVWcWWW7Ei8ptMyVRhwYwxGBHo83TmNJkw2U'),
    [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('HZrJDqzqR12BBUfmxaaPNbnSB9JunWzdzkpQaGYSHNcv'),
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.BSC]: { fetch, start: 1620518400 },
    [CHAIN.MOONRIVER]: { fetch: async () => ({ dailyVolume: 0 }), start: 1635638400 },
    [CHAIN.MOONBEAM]: { fetch, start: 1642032000 },
  },
}

export default adapter;
