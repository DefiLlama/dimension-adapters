import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('CfeVCTevsVCZrmsrYEcpVzPYgxGmMihASYirpWP7r228')
}, {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
});
adapters.adapter.bsc.start = 1622518288;
export default adapters;
