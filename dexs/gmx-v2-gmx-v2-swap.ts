import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const endpoints: { [key: string]: string } = {
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api",
  [CHAIN.AVAX]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-avalanche-stats/api",
  [CHAIN.BOTANIX]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-botanix-stats/api",
}

const historicalDataSwap = gql`
  query get_volume($period: String!, $id: String!) {
    volumeInfos(where: {period: $period, id: $id}) {
        swapVolumeUsd
      }
  }
`

interface IGraphResponse {
  volumeInfos: Array<{
    marginVolumeUsd: string,
    swapVolumeUsd: string,
  }>
}

const fetch = async (_tt: number, _t: any, options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((options.startOfDay * 1000)))
  const dailyData: IGraphResponse = await request(endpoints[options.chain], historicalDataSwap, {
    id: '1d:' + String(dayTimestamp),
    period: '1d',
  })
  const dailyVolume = dailyData.volumeInfos.length == 1
    ? Number(Object.values(dailyData.volumeInfos[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30
    : 0

  return {
    dailyVolume
  }
}

const fetchSolana = async (_tt: number, _t: any, options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((options.startOfDay * 1000)))
  const targetDate = new Date(dayTimestamp * 1000).toISOString();
  const query = gql`
    {
      volumeRecordDailies(
        where: {timestamp_lte: "${targetDate}"},
        orderBy: timestamp_ASC 
      ) {
          timestamp
          tradeVolume
      }
    }
  `

  const url = "https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql"
  const res = await request(url , query)
  
  const dailyVolume = res.volumeRecordDailies
    .filter((record: {timestamp : string}) => record.timestamp.split('T')[0] === targetDate.split('T')[0])
    .reduce((acc: number, record: { tradeVolume: string }) => acc + Number(record.tradeVolume), 0)
  if (dailyVolume === 0) throw new Error('Not found daily data!.')

  return {
    dailyVolume: dailyVolume / (10 ** 20),
  }
}

const methodology = {
    Volume: "Sum of daily total volume for all markets on a given day.",
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  methodology,
  adapter: {
    [CHAIN.ARBITRUM]: {
      start: '2021-08-31',
    },
    [CHAIN.AVAX]: {
      start: '2021-12-22',
    },
    [CHAIN.BOTANIX]: {
      start: '2025-05-30',
    },
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2021-08-31',
    },
  }
}

export default adapter;
