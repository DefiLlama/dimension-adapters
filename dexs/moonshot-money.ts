import { Dependencies, FetchOptions, FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryAllium } from "../helpers/allium";

const chainConfig: Record<string, { start: string; feeAddress: string }> = {
  [CHAIN.SOLANA]: {
    start: "2024-05-14",
    feeAddress: "5wkyL2FLEcyUUgc3UeGntHTAfWfzDrVuxMnaMm7792Gk",
  },
};

const fetch = async (options: FetchOptions): Promise<FetchResult> => {
  const { feeAddress } = chainConfig[options.chain];
  const start = options.startTimestamp;
  const end = options.endTimestamp;

  const rows = await queryAllium(`
    SELECT
      COALESCE(SUM(t.usd_amount), 0) AS daily_volume
    FROM
      solana.dex.trades t
    WHERE
      t.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
      AND t.block_timestamp < TO_TIMESTAMP_NTZ(${end})
      AND t.signer != '${feeAddress}'
      AND (
        EXISTS (
          SELECT 1
          FROM solana.assets.transfers tr
          WHERE tr.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
            AND tr.block_timestamp < TO_TIMESTAMP_NTZ(${end})
            AND tr.txn_id = t.txn_id
            AND tr.to_address = '${feeAddress}'
            AND tr.mint = '${ADDRESSES.solana.USDC}'
        )
        OR EXISTS (
          SELECT 1
          FROM solana.raw.transactions tx
          WHERE tx.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
            AND tx.block_timestamp < TO_TIMESTAMP_NTZ(${end})
            AND tx.txn_id = t.txn_id
            AND tx.success = true
            AND ARRAY_CONTAINS('${feeAddress}'::VARIANT, tx.account_keys)
        )
      )
  `);

  return { dailyVolume: Number(rows[0].daily_volume) };
};

const methodology = {
  Volume: "Total USD swap volume traded through Moonshot.money.",
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  pullHourly: true,
  adapter: chainConfig,
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  doublecounted: true,
};

export default adapter;
