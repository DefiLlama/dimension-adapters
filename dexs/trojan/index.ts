import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { queryDuneSql } from '../../helpers/dune';

const TROJAN_BOT_FEE_WALLET = '9yMwSPk9mrXSN7yDHUuZurAh1sjbJsfpUqjZ7SvVtdco';

const TROJAN_TERMINAL_FEE_WALLETS = [
  '92Med3qeK7duC5iiYsHX38H2f2twJfRsSx93oNrza2VH',
  '2jwHNxavSoMZMEDbT1eV9PcPt5dDcayCqM6MkgaPpmWQ',
  '65gDv7pZQCZELsNpNYSFEBtNFpWZAbxmRFB6BGMqFkHH',
  'BWgb8wR1FEGiu1jCDSKuHKf752W27b4iN6SvoNCiK4qp',
  '8jgg7moFJkHyTtAv9M6RBSPMp2oXeXhuiUMKW8YbYCWn',
];

const ALL_FEE_WALLETS = [TROJAN_BOT_FEE_WALLET, ...TROJAN_TERMINAL_FEE_WALLETS];

const formatAddresses = (addresses: string[]) => addresses.map((a) => `'${a}'`).join(', ');

const fetch = async (options: FetchOptions) => {
  const now = Date.now()
  const tenHoursAgo = now - (10 * 60 * 60 * 1000)
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay")
  }

  const allFeeWalletsSql = formatAddresses(ALL_FEE_WALLETS);

  const result = await queryDuneSql(options, `
    WITH feeWalletActivity AS (
      SELECT tx_id
      FROM solana.account_activity
      WHERE TIME_RANGE
        AND tx_success
        AND address IN (${allFeeWalletsSql})
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
      JOIN feeWalletActivity a ON t.tx_id = a.tx_id
      WHERE TIME_RANGE
        AND t.trader_id NOT IN (${allFeeWalletsSql})
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
  start: '2024-01-04',
  isExpensiveAdapter: true,
  doublecounted: true,
  methodology: {
    Volume: 'Total USD trading volume of swaps routed through Trojan.',
  },
};

export default adapter;
