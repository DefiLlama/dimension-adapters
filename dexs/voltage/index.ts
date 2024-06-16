import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.FUSE]: sdk.graph.modifyEndpoint('4buFyoUT8Lay3T1DK9ctdMdcpkZMdi5EpCBWZCBTKvQd')
}, {
});

export default adapters;
