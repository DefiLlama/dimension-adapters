import * as sdk from "@defillama/sdk";
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getChainVolume2 } from "../../helpers/getUniSubgraphVolume";

const endpoints = {
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('DFn2ZaLXK4tJkXZ6AhfLF22pNobtTC88f3Ff3bC8by3r'),
  [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('BEKfdhcWBQQuZP5vz8jDZ8ZKRRqAeNYEGfuzdDPzzwnQ'),
  [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('B3L4WgKQ6kc6XyMiZqxQivb7VAQxAntUZcDjUuMHsWuF'),
  [CHAIN.ETHEREUM]: sdk.graph.modifyEndpoint('AC7En34fgba7xJaoziBZtQLc5HgYD53K6YLzKnZy2cai'),
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('9NEeTNdvHDVvLxtzqSGVTiyZ2WqaKWfsv1cDksQbC917'),
};


const VOLUME_FIELD = "volumeUSD";
const graphs = getChainVolume2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "wardenSwaps",
    field: VOLUME_FIELD,
  },
});


const adapter: SimpleAdapter = {
  version: 2,
  adapter: Object.keys(endpoints).reduce((acc, chain: any) => {
    return {
      ...acc,
      [chain]: {
        fetch: graphs(chain as Chain),
        start: '2022-07-10'
      }
    }
  }, {})
};

export default adapter;
