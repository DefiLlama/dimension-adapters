
import { CHAIN } from "../../helpers/chains";
import { BreakdownAdapter, FetchV2, SimpleAdapter } from "../../adapters/types";
import request, { gql } from "graphql-request";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

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

const queryTotalVolume = gql`
  query query_total {
    protocolState(id: "protocol_state") {
        totalVolumeUSD
    }
  }
`

interface IDailyResponse {
    protocolStatistics: [{
        volumeUSD: string,
    }]
}

interface ITotalResponse {
    protocolState: {
        totalVolumeUSD: string,
    }
}

const getFetch = () => (chain: string): FetchV2 => async ({ startOfDay }) => {
    const dailyData: IDailyResponse = await request(endpoints[chain], queryVolume, {
        id: 'Daily:' + startOfDay,
    })
    const totalData: ITotalResponse = await request(endpoints[chain], queryTotalVolume)
    return {
        timestamp: startOfDay,
        dailyVolume: dailyData.protocolStatistics[0].volumeUSD,
        totalVolume: totalData.protocolState.totalVolumeUSD,
    }
}

const adapter: SimpleAdapter = {
    version: 2,
    adapter: {
        [CHAIN.ARBITRUM]: {
            fetch: getFetch()(CHAIN.ARBITRUM),
            start: 1715558400,
            meta:{
                methodology: methodology,
            },
        },
    },
}

export default adapter;