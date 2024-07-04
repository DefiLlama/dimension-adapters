import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.XDAI]: sdk.graph.modifyEndpoint('2gNP6y1kTvg6aAhus8DU8DyGS1cn5TvGD3S6VjjXCZZC')
}, {});

adapters.adapter.xdai.start = 1610767793;
export default adapters;
