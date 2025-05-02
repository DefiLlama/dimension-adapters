import * as sdk from "@defillama/sdk";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

export default univ2Adapter2({
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('HTJcrXUUtrVFKyNHZH99ywRx3TQm5ChSFVbn3oBiqGq6')
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});
