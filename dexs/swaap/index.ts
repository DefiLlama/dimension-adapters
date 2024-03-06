import {BaseAdapter, BreakdownAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {gql, GraphQLClient} from "graphql-request";
import {Chain} from "@defillama/sdk/build/general";
import {getTimestampAtStartOfDay,} from "../../utils/date";
import {getChainVolume} from "../../helpers/getUniSubgraphVolume";
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
    swaapSnapshot: {
        id: string,
        totalSwapVolume: string
    } | null
}

async function getTotalVolume(chain: Chain, timestamp: number): Promise<number | null> {
    let id = config[chain].id + '-' + timestamp

    const url = config[chain].api
    const graphQLClient = new GraphQLClient(url);
    const todayVolumeQuery = gql`
    {
          swaapSnapshot(id:"${id}"){
            id
            totalSwapVolume
          }
    }
        `;

    const result = await graphQLClient.request(todayVolumeQuery) as Data
    return result.swaapSnapshot ? Number(result.swaapSnapshot.totalSwapVolume) : null
}

/**
 * While the getTotalVolume is null, fetch getTotalVolume of the previous day
 * @param chain
 * @param timestamp
 */
async function getClosestTotalVolume(chain: Chain, timestamp: number): Promise<number> {

    const minimalTS = config[chain].start
    if (timestamp <= minimalTS) {
        return config[chain].firstDayVolume
    }


    let totalVolume = await getTotalVolume(chain, timestamp)
    if (totalVolume === null) {
        const yesterdayTS = timestamp - 24 * 3600
        totalVolume = await getClosestTotalVolume(chain, yesterdayTS)
    }
    return totalVolume
}


async function getVolume(chain: Chain, timestamp: number,) {

    const timestampBegin =getTimestampAtStartOfDay(timestamp)
    const timestampYesterday = timestampBegin - 24 * 3600

    const totalVolume = await getClosestTotalVolume(chain, timestampBegin)
    const yesterdayVolume = await getClosestTotalVolume(chain, timestampYesterday)

    const dailyVolume = totalVolume - yesterdayVolume

    return {
        totalVolume,
        dailyVolume
    }
}

const v2graphs = (chain: Chain) => {
    return async (timestamp: number) => {

        const {totalVolume, dailyVolume} = await getVolume( chain, timestamp)
        return {
            timestamp,
            totalVolume:totalVolume.toString(),
            dailyVolume:dailyVolume.toString()

        };
    }
}

const adapterV2: BaseAdapter = Object.keys(config).reduce((acc, chain) => {
        return {
            ...acc,
            [chain]: {
                fetch: v2graphs(chain),
                start: config[chain].start,
                runAtCurrTime: false,
                meta: {
                    methodology: 'Comparing total volume of the current day with the total volume of the previous day, using TheGraph.'
                }
            },
        }
    }, {} as BaseAdapter)
;

// Directly from Balancer adapter
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
        v2: adapterV2
    }
}



export default adapter;

