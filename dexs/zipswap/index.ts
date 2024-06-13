import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('5tAUjmnM9iE4aADZwKhk3fobY8fMFbb1VMsrSKvo4kFr')
}, {});
