/**
 * Valhalla — Meteora liquidity-management fees.
 *
 * Valhalla is a Solana bot that opens, manages, claims and closes user-owned
 * Meteora DLMM positions.  It does not custody position liquidity, so this is
 * a fees adapter, not a TVL adapter.
 *
 * The fees metric is the gross LP trading fees paid out by Meteora DLMM.  We
 * identify a Valhalla-managed claim from the application's public, on-chain
 * fee transfer, then join it to Meteora's decoded claim event by transaction
 * id.  This counts the two actual assets claimed by the LP, rather than
 * extrapolating from Valhalla's management-fee receipt.
 *
 * The application charges a percentage of LP fees at claim/close and a small
 * opening fee.  Rates vary by user discount, referrals and a fee cap, so gross
 * fees cannot be safely inferred from a fixed commission rate.  DAMM v2 is
 * deliberately excluded from this performance-fee metric until its matching
 * decoded claim data can be validated.  No internal user, referral, or
 * application data is queried.
 */
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryAllium } from "../helpers/allium";

// https://solscan.io/account/BGP8a4yW8THuUZaq2TxVPU6KjHXi7G4McRyz333uuqNr
const TREASURY = "BGP8a4yW8THuUZaq2TxVPU6KjHXi7G4McRyz333uuqNr";
// https://solscan.io/account/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo
const METEORA_DLMM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
const LP_FEE_LABEL = "Meteora DLMM LP Fees Claimed";
type FeeRow = {
  row_type: "claimed_fee";
  mint: string;
  raw_amount: string | number;
};

const fetch = async (options: FetchOptions) => {
  const timeRange =
    "block_timestamp >= TO_TIMESTAMP_NTZ(" +
    options.startTimestamp +
    ") AND block_timestamp < TO_TIMESTAMP_NTZ(" +
    options.endTimestamp +
    ")";

  // program_id includes top-level calls and CPIs. The management-fee transfer
  // is a top-level System Program transfer appended after the DLMM workflow.
  const query =
    "WITH dlmm_transactions AS (" +
    " SELECT txn_id, MAX(instruction_index) AS last_meteora_instruction_index" +
    " FROM solana.raw.instructions" +
    " WHERE parent_tx_success = true AND program_id = '" +
    METEORA_DLMM +
    "' AND " +
    timeRange +
    " GROUP BY txn_id)," +
    " treasury_receipts AS (" +
    " SELECT t.txn_id" +
    " FROM solana.assets.transfers t" +
    " INNER JOIN dlmm_transactions m ON m.txn_id = t.txn_id" +
    " WHERE t.to_address = '" +
    TREASURY +
    "' AND t.mint = '" +
    ADDRESSES.solana.SOL +
    "' AND t.program_name = 'system' AND t.type = 'transfer'" +
    " AND t.transfer_type = 'sol_transfer'" +
    " AND t.instruction_index > m.last_meteora_instruction_index AND " +
    timeRange;
  const resultQuery =
    query +
    "), claimed_fee_transactions AS (" +
    " SELECT DISTINCT f.txn_id" +
    " FROM solana.defi.fees_claimed f" +
    " INNER JOIN treasury_receipts t ON t.txn_id = f.txn_id" +
    " WHERE f.project = 'meteora' AND f.protocol = 'meteora-dlmm'" +
    "), claimed_fees AS (" +
    " SELECT 'claimed_fee' AS row_type, mint_x AS mint," +
    " CAST(raw_amount_x AS NUMBER(38, 0)) AS raw_amount" +
    " FROM solana.defi.fees_claimed" +
    " WHERE txn_id IN (SELECT txn_id FROM claimed_fee_transactions)" +
    " AND mint_x IS NOT NULL AND raw_amount_x IS NOT NULL" +
    " UNION ALL" +
    " SELECT 'claimed_fee' AS row_type, mint_y AS mint," +
    " CAST(raw_amount_y AS NUMBER(38, 0)) AS raw_amount" +
    " FROM solana.defi.fees_claimed" +
    " WHERE txn_id IN (SELECT txn_id FROM claimed_fee_transactions)" +
    " AND mint_y IS NOT NULL AND raw_amount_y IS NOT NULL" +
    ") SELECT row_type, mint, SUM(raw_amount) AS raw_amount" +
    " FROM claimed_fees GROUP BY row_type, mint";

  const dailyFees = options.createBalances();
  const rows: FeeRow[] = await queryAllium(resultQuery);
  rows.forEach((row) => {
    dailyFees.add(row.mint, row.raw_amount, LP_FEE_LABEL);
  });

  return { dailyFees };
};

const methodology = {
  Fees:
    "Gross LP trading fees claimed by Valhalla-managed Meteora DLMM positions. Each public Meteora claim event is counted only when its transaction contains Valhalla's matching post-workflow management-fee transfer; claim assets are measured directly, not inferred from a fee rate. DAMM v2 and opening fees are excluded.",
};

const breakdownMethodology = {
  Fees: {
    [LP_FEE_LABEL]: "Gross LP trading fees paid out by decoded Meteora DLMM claim events in attributable Valhalla transactions.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  // Conservative start.  Do not move it earlier without validating the
  // pre-migration treasury history transaction by transaction.
  adapter: {
    [CHAIN.SOLANA]: { start: "2025-08-06" },
  },
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  fetch,
  methodology,
  breakdownMethodology,
  doublecounted: true, // Meteora's underlying swap fees are tracked separately.
};

export default adapter;
