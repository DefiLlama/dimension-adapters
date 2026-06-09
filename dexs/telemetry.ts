import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

// ref https://dune.com/queries/5424905/8856073
const chainConfig: Record<string, { start: string; feeWallet: string }> = {
  [CHAIN.SOLANA]: {
    start: "2025-08-12",
    feeWallet: "FBYmU5XbRgX2DV2i2SpPPpHpXmf6mdZS98wQChmUyMba",
  },
};

const fetch = async (options: FetchOptions) => {
  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  // skip post > pre balance checks as fee may be set t0 0 it will skip all volumes.
  const { feeWallet } = chainConfig[options.chain];
  const query = `
    WITH bot_trades AS (
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
      WHERE TIME_RANGE
        AND t.trader_id != '${feeWallet}'
        AND EXISTS (
          SELECT 1
          FROM solana.transactions tx
          CROSS JOIN UNNEST(SEQUENCE(1, CARDINALITY(tx.account_keys))) AS u(i)
          WHERE TIME_RANGE
            AND tx.id = t.tx_id
            AND tx.success = true
            AND tx.account_keys[i] = '${feeWallet}'
        )
    )
    SELECT COALESCE(SUM(amount_usd), 0) AS daily_volume
    FROM bot_trades
    WHERE row_num = 1
  `;

  const [result] = await queryDuneSql(options, query);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(result?.daily_volume);

  return { dailyVolume };
};

const methodology = {
  Volume: "Total USD trading volume of swaps routed through Telemetry.",
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: chainConfig,
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology,
  doublecounted: true,
};

export default adapter;
