import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { queryAllium } from '../helpers/allium';
import { CHAIN } from '../helpers/chains';

// ASER (https://aser.trade) is non-custodial: each user trades from their own wallet, and every swap pays
// a fixed 1% fee to this wallet inside the same transaction. A wallet that paid that fee traded that day.
const FEE_WALLET = '5VmZHp6GwbLBHsp4f1CRogWV7RcfSk2KdSuxdyMe8LqD';

const fetch = async (options: FetchOptions) => {
  const result = await queryAllium(`
    SELECT
      COUNT(DISTINCT from_address) AS active_users,
      COUNT(DISTINCT txn_id)       AS trades
    FROM solana.assets.transfers
    WHERE to_address = '${FEE_WALLET}'
      AND from_address != '${FEE_WALLET}'
      AND block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
      AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
  `);

  const row = result[0];
  if (!row) throw new Error(`No ASER user data for ${options.dateString}`);

  return {
    dailyActiveUsers: row.active_users,
    dailyTransactionsCount: row.trades,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.ALLIUM],
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2026-11-01',
  methodology: {
    ActiveUsers: 'Unique wallets that traded through ASER that day: wallets that paid the 1% trading fee to the ASER fee wallet.',
    TransactionsCount: 'Number of swaps made through ASER that day: transactions that paid the trading fee to the ASER fee wallet.',
  },
  isExpensiveAdapter: true,
};

export default adapter;
