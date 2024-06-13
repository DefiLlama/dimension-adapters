import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('CwTzDabgebYMipjh9gqP4Kyrbi3HGQSabBuR4ngorXUt')
}, {});
