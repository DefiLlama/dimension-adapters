
import { CHAIN } from "../../helpers/chains";
import { BreakdownAdapter, Fetch, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
    [CHAIN.ARBITRUM]: "https://graph-arbitrum.equation.trade/subgraphs/name/equation-stats-arbitrum",
}

const methodology = {
    dailyVolume: "Volume from the sum of the open/close/liquidation of positions and liquidity positions.",
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


const getFetch = () => (chain: string): Fetch => async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
    const dailyData: IDailyResponse = await request(endpoints[chain], queryVolume, {
        id: 'Daily:' + dayTimestamp,
    })

    return {
        timestamp: dayTimestamp,
        dailyVolume: dailyData.protocolStatistics[0].volumeUSD,
    }
}

const adapter: SimpleAdapter = {
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: getFetch()(CHAIN.ARBITRUM),
            start: async () => 1697760000,
            meta:{
                methodology: methodology,
            },
        },
    },
}

export default adapter;