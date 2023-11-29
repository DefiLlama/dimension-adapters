import { Fetch, SimpleAdapter } from "../../adapters/types";
import { ARBITRUM } from "../../helpers/chains";
import {request} from 'graphql-request';

// TODO: change these endpoints 
const apiEndPoints = [
    'https://api.studio.thegraph.com/query/48038/lexer-synstats-staging/version/latest',
    'https://api.studio.thegraph.com/query/48038/lexer-xlpstats2-staging/version/latest',
    'https://api.studio.thegraph.com/query/48038/lexer-xlpstats-staging/version/latest',
]

type VolumeStatsQuery = {
    volumeStats: [
        {
            swap: string,
            mint: string,
            burn: string,
            margin: string,
            liquidation: string,
        }
    ]
}

const queryString = `{
    volumeStats(where: {period: total}) {
      swap
      mint
      burn
      margin
      liquidation
    }
  }`

const fetch: Fetch = async(timestamp) => {
    // TODO: get result from fetching api call
    let totalVolume = 0;
    for (const api of apiEndPoints){
        const {swap, mint, burn, liquidation, margin} = (await request<VolumeStatsQuery>(api, queryString)).volumeStats[0];
        const endPointVolume = Number(swap) + Number(mint) + Number(burn) + Number(liquidation) + Number(margin);
        totalVolume += endPointVolume;
    }
    totalVolume /= 1e30
    return {
        timestamp,
        totalVolume: String(totalVolume)
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