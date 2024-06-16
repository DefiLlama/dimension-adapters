import * as sdk from "@defillama/sdk";

import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('YyFnnb7YkVbrxti9TP7pdUdCbY7fD58LxTAYdjRmTwi'),
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('CLMjk3GaCwWCXqz8jFR28YnazCxgXxQmg976JxJoeGtD')
}, {
});

adapters.adapter.polygon.start = 1622766258;
adapters.adapter.bsc.start = 1620174258;
export default adapters;
