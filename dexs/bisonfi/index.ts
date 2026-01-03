import { CHAIN } from "../../helpers/chains";
import { Dependencies, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const BISONFI_PROGRAM = "BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi";

/**
 * BisonFi volume attribution (Solana)
 * - Identify txs that invoke the BisonFi program via solana.instruction_calls
 * - Sum USD swap volume from dex_solana.trades for those txs
 *
 * CI note:
 * PR CI runners typically do not have DUNE_API_KEYS. If missing, return 0 to avoid failing CI.
 */
const fetch = async (_a: number, _b: any, options: FetchOptions): Promise<FetchResultVolume> => {
  const sql = `
    WITH txs AS (
      SELECT DISTINCT tx_id
      FROM solana.instruction_calls
      WHERE executing_account = '${BISONFI_PROGRAM}'
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT
      COALESCE(SUM(t.amount_usd), 0) AS volume_usd
    FROM dex_solana.trades t
    INNER JOIN txs ON txs.tx_id = t.tx_id
    WHERE t.block_time >= from_unixtime(${options.startTimestamp})
      AND t.block_time < from_unixtime(${options.endTimestamp})
  `;

  const rows = await queryDuneSql(options, sql);
  const dailyVolume = Number(rows?.[0]?.volume_usd ?? 0);

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch: fetch,
  chains: [CHAIN.SOLANA],
  start: "2025-12-01",
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
}

export default adapter;
