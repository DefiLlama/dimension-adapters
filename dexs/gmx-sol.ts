import request, { gql } from "graphql-request";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

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
  const res = await request(url, query)

  const dailyVolume = res.volumeRecordDailies
    .filter((record: { timestamp: string }) => record.timestamp.split('T')[0] === targetDate.split('T')[0])
    .reduce((acc: number, record: { tradeVolume: string }) => acc + Number(record.tradeVolume), 0)
  if (dailyVolume === 0) throw new Error('Not found daily data!.')
  return {
    timestamp: options.startOfDay,
    dailyVolume: dailyVolume / (10 ** 20),
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2025-02-12',
    }
  }
}

export default adapter;