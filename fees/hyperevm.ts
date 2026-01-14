import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const query = `
    SELECT
      SUM(gas_price * gas_used) AS gas_fees
    FROM hyperevm.transactions
    WHERE block_time >= from_unixtime(${options.startTimestamp})
      AND block_time <= from_unixtime(${options.endTimestamp})
  `;

  const result: any[] = await queryDuneSql(options, query);
  dailyFees.addGasToken(Number(result[0].gas_fees), METRIC.TRANSACTION_GAS_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-21',
  dependencies: [Dependencies.DUNE],
  protocolType: ProtocolType.CHAIN,
  isExpensiveAdapter: true
}

export default adapter;