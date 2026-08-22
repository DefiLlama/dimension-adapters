import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

const FEE_WALLETS = [
  'F34kcgMgCF7mYWkwLN3WN7KrFprr2NbwxuLvXx4fbztj',
  'K1LRSA1DSoKBtC5DkcvnermRQ62YxogWSCZZPWQrdG5',
  'HEPL5rTb6n1Ax6jt9z2XMPFJcDe9bSWvWQpsK7AMcbZg',
  '96aFQc9qyqpjMfqdUeurZVYRrrwPJG2uPV6pceu4B1yb',
  'BTQyUXhxiLrFPD5JUANCwg4ViibmNY39McmWk4bVNxLA',
  '4vfFG2xGZsjXQgA6ZCTzA1PgUGLppFHY9eGnh3ZVGUuz',
  'A7XTexV13EPnhtH55qhT7qmFkgYCMAMnfXk89VWu9PCJ',
  'GreGavLfh5sK1BeQ2WYvmk352wbyNNzQdCmqWCV8QSib',
];

const formatAddresses = (addresses: string[]) => addresses.map((a) => `'${a}'`).join(', ');

const fetch = async (options: FetchOptions) => {
  const now = Date.now()
  const tenHoursAgo = now - (10 * 60 * 60 * 1000)
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
  }

  const feeWalletsSql = formatAddresses(FEE_WALLETS);

  const result = await queryDuneSql(options, `
    WITH allFeePayments AS (
      SELECT tx_id
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND address IN (${feeWalletsSql})
        AND balance_change > 0
    ),
    botTrades AS (
      SELECT
        t.tx_id,
        t.trader_id,
        t.amount_usd,
        ROW_NUMBER() OVER (
          PARTITION BY t.tx_id, t.trader_id
          ORDER BY t.amount_usd DESC
        ) AS row_num
      FROM dex_solana.trades t
      JOIN allFeePayments a ON t.tx_id = a.tx_id
      WHERE TIME_RANGE
        AND t.trader_id NOT IN (${feeWalletsSql})
    )
    SELECT COALESCE(SUM(amount_usd), 0) AS total_volume
    FROM botTrades
    WHERE row_num = 1
  `);

  return { dailyVolume: result[0].total_volume };
};

const adapter: SimpleAdapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2025-08-15',
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology: {
    Volume: 'Total USD trading volume of swaps routed through SolTrading Bot.',
  },
};

export default adapter;
