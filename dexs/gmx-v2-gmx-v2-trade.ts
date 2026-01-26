import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const volume_subgraphs: Record<string, string> = {
  [CHAIN.ARBITRUM]: "https://gmx.squids.live/gmx-synthetics-arbitrum:prod/api/graphql",
  [CHAIN.AVAX]: "https://gmx.squids.live/gmx-synthetics-avalanche:prod/api/graphql",
  [CHAIN.BOTANIX]: "https://gmx.squids.live/gmx-synthetics-botanix:prod/api/graphql",
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const query = gql`
    query get_volume($period: String!){
    positionsVolume(where: {period: $period}) {
      volume
    }}
  `
  const dailyData = await request(volume_subgraphs[options.chain], query, {
    period: '1d',
  })

  const dailyVolume = Object.values(dailyData.positionsVolume).length>0
    ? Number(Object.values(dailyData.positionsVolume).reduce((sum, element:any) => String(Number(sum) + Number(element.volume)),0)) * 10 ** -30
    : undefined

  return {
    dailyVolume
  }
}

const adapter: Adapter = {
  version: 1,
  methodology: {
    dailyVolume: "Sum of daily total volume for all markets on a given day.",
  },
  fetch,
  adapter: {
    [CHAIN.ARBITRUM]: { start: '2021-08-31', },
    [CHAIN.AVAX]: { start: '2021-12-22', },
    [CHAIN.BOTANIX]: { start: '2025-05-30', }
  }
}

export default adapter;
