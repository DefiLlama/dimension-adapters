import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryDuneSql } from "../helpers/dune";

const chainConfig: Record<string, { start: string; feeAddress: string }> = {
  [CHAIN.SOLANA]: {
    start: "2024-05-14",
    feeAddress: "5wkyL2FLEcyUUgc3UeGntHTAfWfzDrVuxMnaMm7792Gk",
  },
};

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const { feeAddress } = chainConfig[options.chain];

  const rows = await (queryDuneSql(options, `
    WITH moonshot_txs AS (
      SELECT DISTINCT
        tx_id
      FROM
        tokens_solana.transfers
      WHERE
        TIME_RANGE
        AND to_owner = '${feeAddress}'
        AND token_mint_address = '${ADDRESSES.solana.USDC}'

      UNION

      SELECT DISTINCT
        id AS tx_id
      FROM
        solana.transactions
        CROSS JOIN UNNEST(SEQUENCE(1, CARDINALITY(account_keys))) AS u(i)
      WHERE
        TIME_RANGE
        AND success = true
        AND account_keys[i] = '${feeAddress}'
        AND post_balances[i] > pre_balances[i]
    )
    SELECT
      COALESCE(SUM(amount_usd), 0) AS daily_volume
    FROM
      dex_solana.trades
    WHERE
      TIME_RANGE
      AND trader_id != '${feeAddress}'
      AND tx_id IN (SELECT tx_id FROM moonshot_txs)
  `) as any);

  return { dailyVolume: Number(rows[0].daily_volume) };
};

const methodology = {
  Volume: "Total USD swap volume traded through Moonshot.money.",
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
