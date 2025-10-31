import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";

const adapter: SimpleAdapter = {
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Amount of 50% TON transaction fees that were burned',
    HoldersRevenue: 'Amount of 50% TON transaction fees that were burned',
  },
  adapter: {
    [CHAIN.TON]: {
      fetch: async (_: any, _1: any, options: FetchOptions) => {
        const query = `
            SELECT 
            SUM(total_fees) AS tx_fees
            FROM ${options.chain}.raw.transactions
            WHERE utime >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
            AND utime < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;
        const res = await queryAllium(query);
        const dailyFees = options.createBalances();
        dailyFees.addGasToken(res[0].tx_fees);
        const dailyRevenue = dailyFees.clone(0.5) // burn 50% of fees
        return {
          dailyFees,
          dailyRevenue,
          dailyHoldersRevenue: dailyRevenue
        }
      },
    },
  },
  version: 1,
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
