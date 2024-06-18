import { SimpleAdapter } from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpoint = {
    [CHAIN.FUSE]: "https://api.studio.thegraph.com/query/78455/exchange-v3/version/latest",
};

const v3Graph = getGraphDimensions({
    graphUrls: endpoint,
    totalVolume: {
        factory: "factories"
    },
    dailyVolume: {
        factory: "pancakeDayData",
        field: 'volumeUSD'
    },
    totalFees: {
        factory: "factories"
    },
    dailyFees: {
        factory: "pancakeDayData",
        field: "feesUSD"
    }
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
