import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { gql, request } from 'graphql-request';

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


const fetch: FetchV2 = async ({ startOfDay }: FetchOptions) => {
    // TODO: get result from fetching api call
    let dailyFees = 0;
    for (const api of apiEndPoints) {
        const response: FeeStatsQuery = await request(api, historicalDataSwap, {
            id: String(startOfDay),
            period: "daily",
        })
        dailyFees += response.feeStats.length ? Number(
            Object.values(response.feeStats[0] || {}).reduce((sum, element) =>
                String(Number(sum) + Number(element))
            )
        ) : 0;

    }
    dailyFees /= 1e30
    return {
        dailyFees,
    }
}

const adapter: SimpleAdapter = {
    methodology: {
        Fees: "Trading fees queried from api calls from grpahql",
    },
    version: 2,
    adapter: {
        [CHAIN.ARBITRUM]: {
            start: '2024-01-09',
            fetch,
        }
    }
}

export default adapter;
