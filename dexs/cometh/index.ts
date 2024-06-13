import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('GcokW8RfC9YJeZF4CPoLUwJwZRcQ8kbDR7WziCMus7LF')
}, {
});
