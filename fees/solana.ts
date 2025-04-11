import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";
import { CHAIN } from "../helpers/chains";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: async ({ createBalances, startTimestamp, endTimestamp, }: FetchOptions) => {

        const dailyFees = createBalances()

        const query = `
          SELECT SUM(fee) as value
          FROM solana.raw.transactions
          WHERE block_timestamp BETWEEN TO_TIMESTAMP_NTZ(${startTimestamp}) AND TO_TIMESTAMP_NTZ(${endTimestamp})
          `
        const res = await queryAllium(query)
        dailyFees.add('So11111111111111111111111111111111111111112', res[0].value)
        const dailyRevenue = dailyFees.clone(0.5)

        return {
          dailyFees,
          dailyRevenue,
          dailyHoldersRevenue: dailyRevenue,
        };
      },
      start: '2021-01-17',
    },
  },
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN
}

export default adapter;
