import * as sdk from "@defillama/sdk"
import { ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { request } from "graphql-request"

interface IGraph {
  makerAssetAddr: string;
  makerAssetAmount: string;
  makerToken: string;
  makerTokenAmount: string;
}

interface IData {
  fillOrders: IGraph[];
  swappeds: IGraph[];
  filledRFQs: IGraph[];
}

const fetch = async (__timestamp: number, _: ChainBlocks, { createBalances, fromTimestamp, toTimestamp }: FetchOptions): Promise<FetchResultVolume> => {
  const dailyVolume = createBalances()
  const query = `
    {
      swappeds(first:1000, where:{timestamp_gte:${fromTimestamp}, timestamp_lte:${toTimestamp}}) {
        makerAssetAddr
        makerAssetAmount
      }
      fillOrders(first:1000, where:{timestamp_gte:${fromTimestamp}, timestamp_lte:${toTimestamp}}) {
        makerAssetAddr
        makerAssetAmount
      }
    }
    `

  const endpoint = sdk.graph.modifyEndpoint('5JhweAV1Y3k3GbbEssfetBaoyDNWz1Y72zscRrYsAgVT')
  const response: IData = await request(endpoint, query)

  const historicalData: IGraph[] = [...response.fillOrders, ...response.swappeds]
  historicalData.map((e: IGraph) => {
    dailyVolume.add(e.makerAssetAddr, e.makerAssetAmount)
  })

  return { dailyVolume, timestamp: toTimestamp }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2020-12-17',
    },
  }
}

export default adapter