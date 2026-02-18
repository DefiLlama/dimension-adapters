
import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";

const endpoints: { [key: string]: string } = {
    [CHAIN.ARBITRUM]: "https://graph-arbitrum.equation.trade/subgraphs/name/equation-stats-v3-arbitrum",
}

const methodology = {
    DailyVolume: "Volume from the sum of the open/close/liquidation of positions and liquidity positions.",
}

const queryVolume = gql`
  query query_volume($id: String!) {
    protocolStatistics(where: {id: $id}) {
        volumeUSD
      }
  }
`

interface IDailyResponse {
    protocolStatistics: [{
        volumeUSD: string,
    }]
}

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
    if (timestamp > 1743940800) return {}
    const dailyData: IDailyResponse = await request(endpoints[options.chain], queryVolume, {
        id: 'Daily:' + timestamp,
    })
    return {
        dailyVolume: dailyData.protocolStatistics[0].volumeUSD,
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    methodology,
    deadFrom: "2025-04-06",
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2024-05-13',
        },
    },
}

export default adapter;