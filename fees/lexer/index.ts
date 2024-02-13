import { Fetch, FetchResultFees, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from 'graphql-request';
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

// TODO: change these endpoints
const apiEndPoints = [
    "https://api.studio.thegraph.com/query/50217/synth-stat-v2-arb-mainnet/version/latest",
    "https://api.studio.thegraph.com/query/50217/core-stat-v2-arb-mainnet/version/latest",
]

type FeeStatsQuery = {
    feeStats: [
        {
            swap: string,
            mint: string,
            burn: string,
            marginAndLiquidation: string,
        }
    ]
}

const historicalDataSwap = gql`
  query get_fes($period: String!, $id: String!) {
    feeStats(where: { period: $period, id: $id }) {
        marginAndLiquidation
        swap
        mint
        burn
    }
  }
`;


const fetch: Fetch = async(timestamp): Promise<FetchResultFees> => {
    // TODO: get result from fetching api call
    let dailyFees = 0;
    let totalFees = 0;
    const t = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
    for (const api of apiEndPoints){
        const response: FeeStatsQuery = await request(api, historicalDataSwap, {
            id: String(t),
            period: "daily",
        })
        dailyFees += response.feeStats.length ? Number(
            Object.values(response.feeStats[0] || {}).reduce((sum, element) =>
                String(Number(sum) + Number(element))
            )
            ) : 0;

        const totalResponse: FeeStatsQuery = await request(api, historicalDataSwap, {
            id: "total",
            period: "total",
        })

        totalFees += totalResponse.feeStats.length ? Number(
            Object.values(totalResponse.feeStats[0] || {}).reduce((sum, element) =>
                String(Number(sum) + Number(element))
            )
            ) : 0;
    }
    dailyFees /= 1e30
    totalFees /= 1e30
    return {
        timestamp,
        dailyFees: dailyFees.toString(),
        totalFees: totalFees.toString(),
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            start: 1704758400,
            fetch,
            meta:{
                methodology: "api calls from grpahql"
            }
        }
    }
}

export default adapter;
