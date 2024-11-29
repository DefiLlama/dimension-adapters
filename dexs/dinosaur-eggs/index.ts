import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('63auEwyBju1rZWUNZ32k2qwrBQZSEU4XetvKh3ZCwHLA')
}, {
  factoriesName: "swapFactories",
  dayData: "swapDayData"
});
adapters.adapter.bsc.start = 1633046917;
export default adapters;
