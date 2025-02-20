import * as sdk from "@defillama/sdk";
import request, { gql } from "graphql-request";
import { Fetch, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  // [CHAIN.OPTIMISM]: sdk.graph.modifyEndpoint('Ey9sNQbCAa12m5f89moJrjPxXb5X7rUnGujsfbnSAs48'),
  [CHAIN.BASE]: sdk.graph.modifyEndpoint('61tpLfrdoEor2ep2WctQSpGDSMetmMBc3Bb7zz7iyqsH')
}

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeStats(where: {period: $period, id: $id}) {
        swap,
        margin,
        liquidation,
        mint,
        burn
      }
  }
`

interface IGraphResponse {
  volumeStats: Array<{
    burn: string,
    liquidation: string,
    margin: string,
    mint: string,
    swap: string,
  }>
}

const getFetch = (query: string)=> (chain: string): Fetch => async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[chain], query, {
    id: String(dayTimestamp),
    period: 'daily',
  })
  const totalData: IGraphResponse = await request(endpoints[chain], query, {
    id: 'total',
    period: 'total',
  })
  return {
    timestamp: dayTimestamp,
    dailyVolume:
      dailyData.volumeStats.length == 1
        ? String(Number(Object.values(dailyData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : '0',
    totalVolume:
      totalData.volumeStats.length == 1
        ? String(Number(Object.values(totalData.volumeStats[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30)
        : undefined,
  }
}

const startTimestamps: { [chain: string]: number } = {
  [CHAIN.OPTIMISM]: 1683864388,
  [CHAIN.BASE]:1692688600,
}


const adapter: SimpleAdapter = {
  adapter: {
    // [CHAIN.OPTIMISM]: {
    //   fetch: getFetch(historicalDataSwap)(CHAIN.OPTIMISM),
    //   start: '2023-05-12',
    // },
    [CHAIN.BASE] :{
      fetch: getFetch(historicalDataSwap)(CHAIN.BASE),
      start: '2023-08-22',
    }
  },
};

export default adapter;
