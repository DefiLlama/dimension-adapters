import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('8Lw1rRcKYgi4qfdLuk4gRubLVR48RpGuBCJiB7hLtupt')
}, {
});
