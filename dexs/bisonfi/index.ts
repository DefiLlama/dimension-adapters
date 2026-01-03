import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultVolume } from "../../adapters/types";
import { queryAllium } from "../../helpers/allium";

const BISONFI_PROGRAM = "BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi";

/**
 * BisonFi volume attribution (Solana)
 * - Identify txs that invoke the BisonFi program via solana.instruction_calls
 * - Sum USD swap volume from dex_solana.trades for those txs
 *
 * Notes:
 * - Uses Allium Explorer SQL datasets.
 * - On CI/forks (no key) or when Allium access is restricted, helper returns empty rows,
 *   and the adapter outputs 0 without failing the test runner.
 */
const fetchSolana = async (
  _timestamp: number,
  _block: any,
  options: FetchOptions
): Promise<FetchResultVolume> => {
  const startTimestamp = options.fromTimestamp;
  const endTimestamp = options.toTimestamp;

  const sql = `
    WITH txs AS (
      SELECT DISTINCT tx_id
      FROM solana.instruction_calls
      WHERE executing_account = '${BISONFI_PROGRAM}'
        AND block_time >= from_unixtime(${startTimestamp})
        AND block_time < from_unixtime(${endTimestamp})
    )
    SELECT
      COALESCE(SUM(t.amount_usd), 0) AS volume_usd
    FROM dex_solana.trades t
    INNER JOIN txs ON txs.tx_id = t.tx_id
    WHERE t.block_time >= from_unixtime(${startTimestamp})
      AND t.block_time < from_unixtime(${endTimestamp})
  `;

  const rows = await queryAllium(sql);
  const volumeUsd = Number(rows?.[0]?.volume_usd ?? 0);
  return { dailyVolume: `${volumeUsd}` };
};

export default {
  name: "bisonfi",
  chains: [CHAIN.SOLANA],
  fetch: fetchSolana,
  start: "2025-12-01",
};
