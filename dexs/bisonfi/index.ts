import { CHAIN } from "../../helpers/chains";
import { FetchOptions, FetchResultVolume } from "../../adapters/types";
import { queryDuneSql } from "../../helpers/dune";

const BISONFI_PROGRAM = "BiSoNHVpsVZW2F7rx2eQ59yQwKxzU5NvBcmKshCSUypi";

/**
 * BisonFi volume attribution:
 * - Identify Solana transactions that invoke the BisonFi program
 * - Sum USD-denominated swap volume from dex_solana.trades for those txs
 *
 * This approach ensures only BisonFi-executed spot trades are counted.
 */
const fetchSolana = async (
  _timestamp: number,
  _block: any,
  options: FetchOptions
): Promise<FetchResultVolume> => {
  const startTimestamp = options.fromTimestamp;
  const endTimestamp = options.toTimestamp;

  const rows = await queryDuneSql(
    options,
    `
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
    `
  );

  const volumeUsd = Number(rows?.[0]?.volume_usd ?? 0);
  return { dailyVolume: `${volumeUsd}` };
};

export default {
  name: "bisonfi",
  chains: [CHAIN.SOLANA],
  fetch: fetchSolana,
  start: "2025-12-01",
};
