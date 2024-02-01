import { Fetch, SimpleAdapter } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import {request} from 'graphql-request';

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

const queryString = `{
    feeStats(where: {period: total}) {
      marginAndLiquidation
      swap
      mint
      burn
    }
  }`

const fetch: Fetch = async(timestamp) => {
    // TODO: get result from fetching api call
    let totalFee = 0;
    for (const api of apiEndPoints){
        const {swap, mint, burn, marginAndLiquidation} = (await request<FeeStatsQuery>(api, queryString)).feeStats[0];
        const endPointFee = Number(swap) + Number(mint) + Number(burn) + Number(marginAndLiquidation);
        totalFee += endPointFee;
    }
    totalFee /= 1e30
    return {
        timestamp,
        totalFees: String(totalFee)
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [ARBITRUM]: {
            runAtCurrTime: true,
            start: async () => 1630368000,
            fetch,
            meta:{
                methodology: "api calls from grpahql"
            }
        }
    }
}

export default adapter;