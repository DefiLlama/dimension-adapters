import {Adapter, BreakdownAdapter} from "../../adapters/types";
import {CHAIN} from "../../helpers/chains";
import {gql, GraphQLClient} from "graphql-request";
import {Chain} from "@defillama/sdk/build/general";
import {
    getTimestampAtStartOfDay,
} from "../../utils/date";

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

    const timestampProposed = timestamp
    const timestampBegin =getTimestampAtStartOfDay(timestampProposed)
    const timestampYesterday = timestampBegin - 24 * 3600

    console.log('timestampProposed', {timestampProposed, timestampBegin, timestampYesterday})


    console.log('000 ===== Looking for volume at timestamp', timestamp, asString(timestamp))
    const totalVolume = await getClosestTotalVolume(chain, timestampBegin)
    const yesterdayVolume = await getClosestTotalVolume(chain, timestampYesterday)

    const dailyVolume = totalVolume - yesterdayVolume

    console.log({todayVolume: totalVolume, yesterdayVolume, dailyVolume})

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

const adapterV2: Adapter = {
    adapter: {
        [CHAIN.ETHEREUM]: {
            fetch: v2graphs(CHAIN.ETHEREUM),
            start: async () => config[CHAIN.ETHEREUM].start,
            runAtCurrTime: false,
            meta: {
                methodology: 'Comparing total volume of the current day with the total volume of the previous day, using TheGraph.'
            }
        },
    },
};

export default adapterV2;

// return date as 2023/07/28
function asString(timestamp:number){
    const date = new Date(timestamp * 1000);
    return date.toISOString().split('T')[0]
}