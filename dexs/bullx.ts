import ADDRESSES from '../helpers/coreAssets.json';
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const chainConfig = {
  [CHAIN.SOLANA]: {
    start: '2024-04-03',
    feeWallets: {
      old: 'F4hJ3Ee3c5UuaorKAMfELBjYCjiiLH75haZTKqTywRP3',
      current: '9RYJ3qr5eU5xAooqVcbmdeusjcViL5Nkiq7Gske3tiKq',
    },
    cutoffDate: '2024-11-16',
  },
};

const fetch: any = async (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const { feeWallets, cutoffDate } = chainConfig[CHAIN.SOLANA];
  const feeWallet = options.dateString >= cutoffDate ? feeWallets.current : feeWallets.old;

  const data = await queryDuneSql(options, `
    WITH bullx_txs AS (
      SELECT DISTINCT id AS tx_id
      FROM solana.transactions
      CROSS JOIN UNNEST(SEQUENCE(1, CARDINALITY(account_keys))) AS u(i)
      WHERE TIME_RANGE
        AND success = true
        AND CONTAINS(account_keys, '${feeWallet}')
        AND account_keys[i] = '${feeWallet}'
        AND post_balances[i] > pre_balances[i]
    ),
    bot_trades AS (
      SELECT
        t.tx_id,
        t.trader_id,
        t.amount_usd,
        t.outer_instruction_index,
        t.inner_instruction_index,
        ROW_NUMBER() OVER (
          PARTITION BY t.tx_id, t.trader_id, t.outer_instruction_index, t.inner_instruction_index
          ORDER BY
            CASE WHEN t.token_bought_symbol = 'WSOL' OR t.token_sold_symbol = 'WSOL' THEN 0 ELSE 1 END,
            t.amount_usd DESC
        ) AS row_num
      FROM dex_solana.trades t
      JOIN bullx_txs b ON t.tx_id = b.tx_id
      WHERE TIME_RANGE
        AND t.trader_id != '${feeWallet}'
        AND (
          t.token_bought_symbol = 'WSOL'
          OR t.token_sold_symbol = 'WSOL'
          OR t.token_bought_mint_address = '${ADDRESSES.solana.SOL}'
          OR t.token_sold_mint_address = '${ADDRESSES.solana.SOL}'
        )
    )
    SELECT COALESCE(SUM(amount_usd), 0) AS daily_volume
    FROM bot_trades
    WHERE row_num = 1
  `);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(data[0].daily_volume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Volume: "Total swap volume traded on BullX.",
  },
  doublecounted: true,
};

export default adapter;
