import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

const GACHA_ADDRESS = "GachaNgyXTU3zFogQ8Z5jR2BLXs8215X2AtEH18VxJq3";
const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

const timeRange = (options: FetchOptions) =>
  `block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp}) AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const dailyVolume = options.createBalances();

  const query = `
    WITH flows AS (
      SELECT
        txn_id,
        amount AS usdc
      FROM solana.assets.transfers
      WHERE mint = '${USDC_MINT}'
        AND (to_address = '${GACHA_ADDRESS}' OR from_address = '${GACHA_ADDRESS}')
        AND ${timeRange(options)}
    ),
    memos AS (
      SELECT
        txn_id,
        REGEXP_SUBSTR(
          array_join(log_messages, '||'),
          'Memo \\\\(len [0-9]+\\\\): "([^"]+)"',
          1, 1, 'e', 1
        ) AS memo
      FROM solana.raw.transactions
      WHERE ${timeRange(options)}
        AND txn_id IN (SELECT txn_id FROM flows)
    ),
    ev AS (
      SELECT
        f.usdc,
        REGEXP_SUBSTR(m.memo, ':([a-z]+)', 1, 1, 'e', 1) AS action
      FROM flows f
      JOIN memos m ON f.txn_id = m.txn_id
      WHERE m.memo LIKE 'jupiter-%'
    )
    SELECT COALESCE(SUM(CASE WHEN action = 'open' THEN usdc ELSE 0 END), 0) AS sale_volume
    FROM ev
  `;

  const result = await queryAllium(query);
  const saleVolume = Number(result[0]);
  if (saleVolume) dailyVolume.addUSDValue(saleVolume);

  return { dailyVolume };
};

const methodology = {
  Volume: "Gacha pack sales volume on Jupiter's gacha platform.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  start: "2026-07-01",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  doublecounted: true, // collector-crypt
};

export default adapter;
