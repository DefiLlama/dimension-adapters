import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";

const fetch = async (_: any, _1: any, options: FetchOptions) => {

  const query = `
    SELECT 
    SUM(total_fees) AS tx_fees
    FROM ${options.chain}.raw.transactions
    WHERE utime >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
    AND utime < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `;
  const res = await queryAllium(query);

  const dailyFees = options.createBalances();
  dailyFees.addGasToken(res[0].tx_fees);
  const dailyRevenue = dailyFees.clone(0.5) // burn 50% of fees

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TON],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.ALLIUM],
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Amount of 50% TON transaction fees that were burned',
    HoldersRevenue: 'Amount of 50% TON transaction fees that were burned',
  },
};

export default adapter;
