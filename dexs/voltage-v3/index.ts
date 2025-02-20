import { SimpleAdapter } from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpoint = {
    [CHAIN.FUSE]: "https://api.studio.thegraph.com/query/78455/exchange-v3/version/latest",
};

const v3Graph = getGraphDimensions2({
    graphUrls: endpoint,
    totalVolume: {
        factory: "factories"
    },
    totalFees: {
        factory: "factories"
    },
})

const v3StartTimes = {
    [CHAIN.FUSE]: 1703725380,
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.FUSE]: {
            fetch: v3Graph(CHAIN.FUSE),
            start: v3StartTimes[CHAIN.FUSE]
        }
    }
}

export default adapter
