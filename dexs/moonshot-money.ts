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
    WITH fee_transfers AS (
      SELECT tr.txn_id, tr.usd_amount, tr.mint
      FROM solana.assets.transfers tr
      WHERE tr.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND tr.block_timestamp <  TO_TIMESTAMP_NTZ(${end})
        AND tr.to_address = '${feeAddress}'
    ),
    matched_txns AS (
      SELECT txn_id FROM fee_transfers WHERE mint = '${ADDRESSES.solana.USDC}'
      UNION
      SELECT tx.txn_id
      FROM solana.raw.transactions tx
      WHERE tx.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND tx.block_timestamp <  TO_TIMESTAMP_NTZ(${end})
        AND tx.success = true
        AND ARRAY_CONTAINS('${feeAddress}'::VARIANT, tx.account_keys)
    ),
    volume AS (
      SELECT t.usd_amount
      FROM solana.dex.trades t
      JOIN matched_txns m ON m.txn_id = t.txn_id
      WHERE t.block_timestamp >= TO_TIMESTAMP_NTZ(${start})
        AND t.block_timestamp <  TO_TIMESTAMP_NTZ(${end})
        AND t.signer != '${feeAddress}'
      QUALIFY ROW_NUMBER() OVER (PARTITION BY t.txn_id ORDER BY t.instruction_index DESC, t.inner_instruction_index DESC) = 1
    )
    SELECT
      (SELECT COALESCE(SUM(usd_amount), 0) FROM volume)        AS daily_volume,
      (SELECT COALESCE(SUM(usd_amount), 0) FROM fee_transfers) AS daily_fees
  `);

  const dailyFees = Number(rows[0].daily_fees);

  return {
    dailyVolume: Number(rows[0].daily_volume),
    dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
    dailyUserFees: dailyFees,
  };
};

const methodology = {
  Volume: "Total US-dollar value of the token trades people make in the Moonshot app, counting each trade once even when it is routed through several pools.",
  Fees: "Moonshot's service fee on every trade — around 2.5% on trades under $100 and 1% on larger ones, with a roughly $0.99 minimum.",
  Revenue: "Everything Moonshot earns from its service fee. None of it is shared with liquidity providers, so revenue equals fees.",
  ProtocolRevenue: "The service fees, which all go to Moonshot.",
  UserFees: "The service fee a trader pays each time they trade on Moonshot.",
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
