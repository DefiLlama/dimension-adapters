import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import request, { gql } from "graphql-request";


const fetchSolana = async (_tt: number, _t: any, options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((options.startOfDay * 1000)))
  const targetDate = new Date(dayTimestamp * 1000).toISOString();
  const query = gql`
    {
       feesRecordDailies(where: {timestamp_eq: "${targetDate}"}) {
        tradeFees
        swapFees
      }
    }
  `
  const url = "https://gmx-solana-sqd.squids.live/gmx-solana-base:prod/api/graphql"
  const res = await request(url, query)

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  for (const record of res.feesRecordDailies) {
    dailyFees.addUSDValue(record.tradeFees / 1e20, METRIC.MARGIN_FEES)
    dailyFees.addUSDValue(record.swapFees / 1e20, METRIC.SWAP_FEES)

    dailyRevenue.addUSDValue(record.tradeFees / 1e20 * 0.37, METRIC.MARGIN_FEES)
    dailyRevenue.addUSDValue(record.swapFees / 1e20 * 0.37, METRIC.SWAP_FEES)

    dailyProtocolRevenue.addUSDValue(record.tradeFees / 1e20 * 0.1, METRIC.MARGIN_FEES)
    dailyProtocolRevenue.addUSDValue(record.swapFees / 1e20 * 0.1, METRIC.SWAP_FEES)

    dailyHoldersRevenue.addUSDValue(record.tradeFees / 1e20 * 0.27, METRIC.MARGIN_FEES)
    dailyHoldersRevenue.addUSDValue(record.swapFees / 1e20 * 0.27, METRIC.SWAP_FEES)
  }

  return {
    timestamp: options.startOfDay,
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
  }
}

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: '2025-02-12',
    },
  },
};
export default adapter;
