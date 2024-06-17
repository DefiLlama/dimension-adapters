import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('9xwmkrJTk5s5e8QoBnQG1yTN8seLwzLWwACaqTgq2U9x')
}, {
});
