import { Adapter, FetchOptions, } from "../../adapters/types"
import { CHAIN } from "../../helpers/chains"
import fetchURL from "../../utils/fetchURL"

const bucketApiURL = "https://open-api.bucketprotocol.io/api/"

interface DailyStats {
  date: string
  total_records: number
  total_fee_value: string
  average_fee_value: string
  min_fee_value: string
  max_fee_value: string
  first_record_time: string
  last_record_time: string
  first_record_time_ms: number
  last_record_time_ms: number
}

const methodology = {
  dailyFees:
    "All the services fees paid by users, including borrow, PSM, liquidation, redeem, flashLoan and interest",
  dailyRevenue:
    "All the services fees paid by users, including borrow, PSM, liquidation, redeem, flashLoan and interest earned by Bucket",
}

const fetchBucketStats = async (_: any, _1: any, { startTimestamp, }: FetchOptions) => {
  const url = `${bucketApiURL}fees?timestamp_ms=${startTimestamp * 1000}`
  const stats: DailyStats = (await fetchURL(url)).data

  const dailyFees = stats.total_fee_value
  const dailyRevenue = stats.total_fee_value

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  }
}

const adapter: Adapter = {
  methodology,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchBucketStats,
      start: "2024-02-29",
    },
  },
}

export default adapter
