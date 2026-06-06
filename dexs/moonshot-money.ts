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

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const tenHoursAgo = Date.now() - (10 * 60 * 60 * 1000);
  if ((options.toTimestamp * 1000) > tenHoursAgo) {
    throw new Error("End timestamp is less than 10 hours ago, skipping due to dune indexing delay");
  }

  const { feeAddress } = chainConfig[options.chain];

  const rows = await (queryDuneSql(options, `
    SELECT
      COALESCE(SUM(amount_usd), 0) AS daily_volume
    FROM
      dex_solana.trades t
    WHERE
      TIME_RANGE
      AND t.trader_id != '${feeAddress}'
      AND (
        EXISTS (
          SELECT 1
          FROM tokens_solana.transfers tr
          WHERE TIME_RANGE
            AND tr.tx_id = t.tx_id
            AND tr.to_owner = '${feeAddress}'
            AND tr.token_mint_address = '${ADDRESSES.solana.USDC}'
        )
        OR EXISTS (
          SELECT 1
          FROM solana.transactions tx
          CROSS JOIN UNNEST(SEQUENCE(1, CARDINALITY(tx.account_keys))) AS u(i)
          WHERE TIME_RANGE
            AND tx.id = t.tx_id
            AND tx.success = true
            AND tx.account_keys[i] = '${feeAddress}'
        )
      )
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
