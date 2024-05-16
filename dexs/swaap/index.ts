import { BreakdownAdapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, GraphQLClient } from "graphql-request";
import { getChainVolume } from "../../helpers/getUniSubgraphVolume";
import customBackfill from "../../helpers/customBackfill";

interface ChainConfig{
    api: string,
    start: number,
    id: string,
    firstDayVolume: number
}

const config:Record<string, ChainConfig> = {
    [CHAIN.ETHEREUM]: {
        api: "https://api.thegraph.com/subgraphs/name/swaap-labs/swaapv2-ethereum",
        start: 1688169600,
        id: '2',
        firstDayVolume: 0
    },
    [CHAIN.POLYGON]: {
        api: "https://api.thegraph.com/subgraphs/name/swaap-labs/swaapv2-polygon",
        start: 1688083200,
        id: '2',
        firstDayVolume: 240.41984714755376

    },
    [CHAIN.ARBITRUM]: {
        api: "https://api.thegraph.com/subgraphs/name/swaap-labs/swaapv2-arbitrum",
        start: 1696464000,
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
    const graphQLClient = new GraphQLClient(url);
    const result: Data = await graphQLClient.request(query)
    const dailyVolume = Number(result.end?.totalSwapVolume || 0) - Number(result.start?.totalSwapVolume || 0)
    const totalVolume = Number(result.end?.totalSwapVolume || 0)
    return {
        dailyVolume,
        totalVolume,
    }
}

const v2graphs = async (options: FetchOptions): Promise<FetchResultV2> => {
    const { dailyVolume, totalVolume }  = await getVolume(options)
    return {
        dailyVolume,
        totalVolume
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
        [CHAIN.POLYGON]: "https://api.thegraph.com/subgraphs/name/swaap-labs/swaapv1"
    },
    ...graphParams
});

const adapter: BreakdownAdapter = {
    version: 2,
    breakdown: {
        v1: {
            [CHAIN.POLYGON]: {
                fetch: v1graphs(CHAIN.POLYGON),
                start: 1655195452,
                customBackfill: customBackfill(CHAIN.POLYGON, v1graphs)
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
        }
    }
}



export default adapter;
