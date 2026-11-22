import { Dependencies, FetchOptions, SimpleAdapter } from '../adapters/types';
import { queryAllium } from '../helpers/allium';
import { CHAIN } from '../helpers/chains';

// ASER (https://aser.trade) is non-custodial: each user trades from their own wallet, and every swap pays
// a fixed 1% fee to this wallet inside the same transaction. A wallet that paid that fee in a transaction that
// also contains a DEX swap traded that day; plain transfers to the fee wallet are not counted.
const FEE_WALLET = '5VmZHp6GwbLBHsp4f1CRogWV7RcfSk2KdSuxdyMe8LqD';

const fetch = async (options: FetchOptions) => {
  const timeRange = `block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  const result = await queryAllium(`
    SELECT
      COUNT(DISTINCT t.from_address) AS active_users,
      COUNT(DISTINCT t.txn_id)       AS trades
    FROM solana.assets.transfers t
    WHERE t.to_address = '${FEE_WALLET}'
      AND t.from_address != '${FEE_WALLET}'
      AND t.${timeRange}
      AND t.txn_id IN (
        SELECT txn_id
        FROM solana.dex.trades
        WHERE ${timeRange}
      )
  `);

  const row = result[0];
  if (!row) throw new Error(`No ASER user data for ${options.dateString}`);

  return {
    dailyActiveUsers: row.active_users,
    dailyTransactionsCount: row.trades,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: false, // unique wallets over a day cannot be summed from hourly counts, so the day is read whole
  dependencies: [Dependencies.ALLIUM],
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: '2026-11-01',
    },
  },
  methodology: {
    ActiveUsers: 'Unique wallets that traded through ASER that day: wallets that paid the 1% trading fee to the ASER fee wallet in a transaction that contains a DEX swap.',
    TransactionsCount: 'Number of swaps made through ASER that day: swap transactions that paid the trading fee to the ASER fee wallet.',
  },
  isExpensiveAdapter: true,
};

export default adapter;
