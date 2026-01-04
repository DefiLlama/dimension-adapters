import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultFees } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";
import { getEnv } from "../../helpers/env";

const SERUM_PROGRAM = "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin";

const fetchSolana = async (
  _timestamp: number,
  _block: any,
  options: FetchOptions
): Promise<FetchResultFees> => {
  // CI note: PR CI runners typically do not have DUNE_API_KEYS.
  // Return 0 so CI doesn’t fail.
  if (!getEnv("DUNE_API_KEYS")) return { dailyFees: "0" };

  const startTimestamp = options.fromTimestamp;
  const endTimestamp = options.toTimestamp;

  try {
    const rows = await queryDuneSql(
      options,
      `
      WITH serum_txs AS (
        SELECT DISTINCT tx_id
        FROM solana.instruction_calls
        WHERE executing_account = '${SERUM_PROGRAM}'
          AND block_time >= from_unixtime(${startTimestamp})
          AND block_time <  from_unixtime(${endTimestamp})
      )
      SELECT
        COALESCE(SUM(COALESCE(t.fee_usd, 0)), 0) AS fees_usd
      FROM dex_solana.trades t
      INNER JOIN serum_txs s ON s.tx_id = t.tx_id
      WHERE t.block_time >= from_unixtime(${startTimestamp})
        AND t.block_time <  from_unixtime(${endTimestamp})
      `
    );

    const feesUsd = Number(rows?.[0]?.fees_usd ?? 0);
    return { dailyFees: `${feesUsd}` };
  } catch (e) {
    return { dailyFees: "0" };
  }
};

export default {
  adapter: {
    [CHAIN.SOLANA]: {
      fetch: fetchSolana,
      start: 1627776000, // Aug 1, 2021
    },
  },
};
