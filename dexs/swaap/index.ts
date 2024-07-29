import * as sdk from "@defillama/sdk";
import { BreakdownAdapter, ChainBlocks, FetchOptions, FetchResult, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";

interface ChainConfig{
    api: string,
    start: number,
    id: string,
    firstDayVolume: number
}

const config:Record<string, ChainConfig> = {
    [CHAIN.ETHEREUM]: {
        api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-ethereum/1.0.0/gn",
        start: 1688169600,
        id: '2',
        firstDayVolume: 0
    },
    [CHAIN.POLYGON]: {
        api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-polygon/1.0.0/gn",
        start: 1688083200,
        id: '2',
        firstDayVolume: 240.41984714755376

    },
    [CHAIN.ARBITRUM]: {
        api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-arbitrum/1.0.0/gn",
        start: 1696464000,
        id: '2',
        firstDayVolume: 0
    },
    [CHAIN.OPTIMISM]: {
        api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-optimism/1.0.0/gn",
        start: 1716986361,
        id: '2',
        firstDayVolume: 0
    },
    [CHAIN.BSC]: {
        api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-bsc/1.0.0/gn",
        start: 1716994360,
        id: '2',
        firstDayVolume: 0
    },
    [CHAIN.BASE]: {
        api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-base/1.0.0/gn",
        start: 1715692069,
        id: '2',
        firstDayVolume: 0
    },
    [CHAIN.MODE]: {
        api: "https://api.goldsky.com/api/public/project_clws2t7g7ae9c01xsbnu80a51/subgraphs/swaapv2-mode/1.0.1/gn",
        start: 1714652681,
        id: '2',
        firstDayVolume: 0
    },
}

interface Data {
    start: {
        id: string,
        totalSwapVolume: string
    },
    end: {
        id: string,
        totalSwapVolume: string
    }
}


const  getVolume = async (options: FetchOptions) => {
    const endtimestamp =  options.startOfDay
    const starttimestamp = endtimestamp - 86400
    const startId = config[options.chain].id + '-' + starttimestamp
    const endId = config[options.chain].id + '-' + endtimestamp

    const query = gql`
    {
        start:swaapSnapshot(id: "${startId}") {
            id
            totalSwapVolume
        }
        end:swaapSnapshot(id: "${endId}") {
            id
            totalSwapVolume
        }
    }
    `
    const url = config[options.chain].api
    const graphQLClient = new GraphQLClient(url, { timeout: 3000 });
    const result: Data = await graphQLClient.request(query)
    const dailyVolume = Number(result.end?.totalSwapVolume || 0) - Number(result.start?.totalSwapVolume || 0)
    const totalVolume = Number(result.end?.totalSwapVolume || 0)
    return {
        dailyVolume,
        totalVolume,
    }
}

const v2graphs = async (timestamp: number, chainBlocks: ChainBlocks, options: FetchOptions): Promise<FetchResult> => {
    const { dailyVolume, totalVolume }  = await getVolume(options)
    return {
        dailyVolume,
        totalVolume,
        timestamp
    }
}

const graphParams = {
    totalVolume: {
        factory: "swaapProtocols",
        field: "totalSwapVolume",
    },
    hasDailyVolume: false,
}

const v1graphs = getChainVolume({
    graphUrls: {
        [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('A1ibaGVUkqdLeBG7VeeSB8jm9QNmS8phSz8iooXR8puv')
    },
    ...graphParams,
});

const adapter: BreakdownAdapter = {
    breakdown: {
        v1: {
            [CHAIN.POLYGON]: {
                fetch: v1graphs(CHAIN.POLYGON),
                start: 1655195452
            },
        },
        v2: {
            [CHAIN.ETHEREUM]: {
                fetch: v2graphs,
                start: 1688169600,

            },
            [CHAIN.POLYGON]: {
                fetch: v2graphs,
                start: 1688083200,

            },
            [CHAIN.ARBITRUM]: {
                fetch: v2graphs,
                start: 1696464000,
            },
            [CHAIN.OPTIMISM]: {
                fetch: v2graphs,
                start: 1716986361,
            },
            [CHAIN.BSC]: {
                fetch: v2graphs,
                start: 1716994360,
            },
            [CHAIN.BASE]: {
                fetch: v2graphs,
                start: 1715692069,
            },
            [CHAIN.MODE]: {
                fetch: v2graphs,
                start: 1714652681,
            },

        }
    }
}



export default adapter;
