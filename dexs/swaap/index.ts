import * as sdk from "@defillama/sdk";
import { BreakdownAdapter, FetchOptions, FetchResultV2 } from "../../adapters/types";
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
        api: sdk.graph.modifyEndpoint('6ZxFsA2sR62j3Hepprkeu5co3aVupg4YZXCsHyM8SFZs'),
        start: 1688169600,
        id: '2',
        firstDayVolume: 0
    },
    [CHAIN.POLYGON]: {
        api: sdk.graph.modifyEndpoint('AqeDaXDjW3ttvYDGtdK1LC2igJ2usukrcbYmM2rBwesT'),
        start: 1688083200,
        id: '2',
        firstDayVolume: 240.41984714755376

    },
    [CHAIN.ARBITRUM]: {
        api: sdk.graph.modifyEndpoint('5EPpDeMUhrYgm91MJCidUgvraS41y9eCRasfjFY6gnYe'),
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
    const graphQLClient = new GraphQLClient(url, { timeout: 3000 });
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
        [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('A1ibaGVUkqdLeBG7VeeSB8jm9QNmS8phSz8iooXR8puv')
    },
    ...graphParams,
});

const adapter: BreakdownAdapter = {
    version: 2,
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
        }
    }
}



export default adapter;
