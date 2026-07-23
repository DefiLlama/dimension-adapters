import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";

const fetch = async (options: FetchOptions) => {
  const query = `
  SELECT 
      SUM(gas_used * gas_unit_price) AS tx_fees
  FROM ${options.chain}.raw.transactions
  WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
  AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  const res = await queryAllium(query);
  const dailyFees = options.createBalances();
  dailyFees.addCGToken('aptos', res[0].tx_fees / 10 ** 8)

  return {
    dailyFees,
    dailyRevenue: dailyFees,
    dailyHoldersRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "Transaction fees paid by users for executing transactions on the Aptos network",
  Revenue: "All the transaction fees paid are burnt",
  HoldersRevenue: "All the transaction fees paid are burned",
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.APTOS],
  isExpensiveAdapter: true,
  dependencies: [Dependencies.ALLIUM],
  protocolType: ProtocolType.CHAIN,
  methodology,
};

export default adapter;
