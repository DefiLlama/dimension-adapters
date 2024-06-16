import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('CnzVKhPQizzxSpysSveSLt1XZqkBRSprFtFJv3RaBQPv')
}, {});

adapters.adapter.arbitrum.start = 1668124800;
export default adapters;
