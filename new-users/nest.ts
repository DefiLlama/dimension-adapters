import { Dependencies, SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const ADDRESSES = [
  '0x2f2Ae07e3cc3391A2E27825652BA8DcdD5412074', // VotingEscrow
  '0x566bdc5444fd5fe5d93ec379Bd66eC861ddbA901', // Voter
  '0xaA26B8e5Cadd04430c32787eCC3AA325e99681e9', // Swap Router
]

const ADDRESS_LIST = ADDRESSES.map((a) => a.toLowerCase()).join(',')
const START = '2025-10-30'
const START_TIMESTAMP = Math.floor(Date.parse(`${START}T00:00:00Z`) / 1000)

const fetch = async (options: FetchOptions) => {
  const duneQuery = `
    WITH prior_users AS (
      SELECT DISTINCT "from" AS user
      FROM hyperevm.transactions
      WHERE block_time >= from_unixtime(${START_TIMESTAMP})
        AND block_time < from_unixtime(${options.fromTimestamp})
        AND "to" IN (${ADDRESS_LIST})
    ),
    day_users AS (
      SELECT DISTINCT "from" AS user
      FROM hyperevm.transactions
      WHERE block_time >= from_unixtime(${options.fromTimestamp})
        AND block_time < from_unixtime(${options.toTimestamp})
        AND "to" IN (${ADDRESS_LIST})
    )
    SELECT COALESCE(COUNT(*), 0) AS new_users
    FROM day_users d
    LEFT JOIN prior_users p ON d.user = p.user
    WHERE p.user IS NULL
  `;

  const duneResult = await queryDuneSql(options, duneQuery);

  return {
    dailyNewUsers: duneResult[0].new_users,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  start: START,
};

export default adapter;
