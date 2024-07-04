import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.ARBITRUM]: sdk.graph.modifyEndpoint('8zagLSufxk5cVhzkzai3tyABwJh53zxn9tmUYJcJxijG')
}, {});

adapters.adapter.arbitrum.start = 1668124800;
export default adapters;
