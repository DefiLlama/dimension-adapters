import { Dependencies, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {  queryDuneSql } from "../helpers/dune";

const ADDRESSES = [
  '0x2f2Ae07e3cc3391A2E27825652BA8DcdD5412074', // VotingEscrow
  '0x566bdc5444fd5fe5d93ec379Bd66eC861ddbA901', // Voter
  '0xaA26B8e5Cadd04430c32787eCC3AA325e99681e9', // Swap Router
]

const fetch = async (options: FetchOptions) => {

    const duneQuery = `
      SELECT 
        SUM(gas_limit * gas_price)/1e18 AS gas_used,
        COALESCE(count(distinct "from"), 0) AS user_count,
        COALESCE(count(*), 0) AS total_transaction_count
      FROM hyperevm.transactions
      WHERE 
        block_time>=from_unixtime(${options.fromTimestamp}) AND block_time<from_unixtime(${options.toTimestamp})
        AND "to" IN (${ADDRESSES.map(a => `${a.toLowerCase()}`).join(',')})
    `;

    const duneResult = await queryDuneSql(options, duneQuery);

    return {
        dailyActiveUsers: duneResult[0].user_count,
        dailyTransactionsCount: duneResult[0].total_transaction_count,
        dailyGasUsed: duneResult[0].gas_used,
    }
}

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.HYPERLIQUID],
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    start: "2025-10-30",
};

export default adapter;
