import request, { gql } from "graphql-request";
import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date";

const volume_subgraphs: Record<string, string> = {
  [CHAIN.ARBITRUM]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-arbitrum-stats/api",
  [CHAIN.AVAX]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-avalanche-stats/api",
  [CHAIN.SOLANA]: "https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql",
  [CHAIN.BOTANIX]: "https://subgraph.satsuma-prod.com/3b2ced13c8d9/gmx/synthetics-botanix-stats/api",
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay)
  const query = gql`
    query get_volume($period: String!, $id: String!) {
      volumeInfos(where: {period: $period, id: $id}) {
          marginVolumeUsd
        }
    }
  `
  const dailyData = await request(volume_subgraphs[options.chain], query, {
    id: '1d:' + String(dayTimestamp),
    period: '1d',
  })

  const dailyVolume = dailyData.volumeInfos.length == 1
    ? Number(Object.values(dailyData.volumeInfos[0]).reduce((sum, element) => String(Number(sum) + Number(element)))) * 10 ** -30
    : undefined

  return {
    dailyVolume
  }
}

const fetchSolana = async (_a: any, _b: any, options: FetchOptions) => {
  const dayTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay)
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
  const res = await request(volume_subgraphs[options.chain], query)

  const dailyVolume = res.volumeRecordDailies
    .filter((record: { timestamp: string }) => record.timestamp.split('T')[0] === targetDate.split('T')[0])
    .reduce((acc: number, record: { tradeVolume: string }) => acc + Number(record.tradeVolume), 0)
  if (dailyVolume === 0) throw new Error('Not found daily data!.')

  return {
    dailyVolume: dailyVolume / (10 ** 20)
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
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2021-08-31',
    },
    [CHAIN.BOTANIX]: { start: '2025-05-30', }
  }
}

export default adapter;
