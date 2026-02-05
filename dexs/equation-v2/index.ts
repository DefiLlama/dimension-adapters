
import { CHAIN } from "../../helpers/chains";
import { BreakdownAdapter, Fetch, FetchOptions, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
    [CHAIN.ARBITRUM]: "https://graph-arbitrum.equation.trade/subgraphs/name/equation-stats-v2-arbitrum",
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
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
    const dailyData: IDailyResponse = await request(endpoints[options.chain], queryVolume, {
        id: 'Daily:' + dayTimestamp,
    })
    return {
        dailyVolume: dailyData.protocolStatistics[0].volumeUSD,
    }
}

const adapter: SimpleAdapter = {
    deadFrom: "2025-04-06",
    methodology,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch,
            start: '2024-01-26',
        },
    },
}

export default adapter;