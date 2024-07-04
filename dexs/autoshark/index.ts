import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('4NDG5dRjJX9BcWaHxKNwTZ1u4jwYP836QX4rgBdeGowD')
}, {});
