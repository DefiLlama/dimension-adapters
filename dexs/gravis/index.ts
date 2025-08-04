import * as sdk from "@defillama/sdk";

import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { SimpleAdapter } from "../../adapters/types";

const fetch = univ2Adapter({
  endpoints: {
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('YyFnnb7YkVbrxti9TP7pdUdCbY7fD58LxTAYdjRmTwi'),
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('CLMjk3GaCwWCXqz8jFR28YnazCxgXxQmg976JxJoeGtD')
  },
});

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.POLYGON]: { fetch, start: 1622766258 },
    [CHAIN.BSC]: { fetch, start: 1620174258 },
  },
}

export default adapter;
