import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.FANTOM]: sdk.graph.modifyEndpoint('71os49womDk3DFcNRCAFYzATxxMgWpSMKhRn5ih6aWF1')
}, {
  factoriesName: "wigoswapFactories",
  dayData: "wigoDayData",
  gasToken: "coingecko:fantom"
});

adapters.adapter.fantom.start = 1642982400;
export default adapters;
