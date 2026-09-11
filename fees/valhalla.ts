/**
 * Valhalla — Meteora liquidity-management fees & revenue.
 *
 * Valhalla is a Solana bot that opens, manages, claims and closes user-owned
 * Meteora DLMM positions.  It does not custody position liquidity, so this is
 * a fees/revenue adapter, not a TVL adapter.
 *
 * Each attributable fee is a native-SOL system transfer appended after the
 * Meteora workflow in a successful position transaction.  The adapter matches
 * that transfer by instruction order, rather than treating every transfer to
 * the treasury in a Meteora transaction as a fee.
 *
 * The application charges a percentage of LP fees at claim/close and a small
 * opening fee.  Rates vary by user discount, referrals and a fee cap, so gross
 * fees cannot be safely inferred from a fixed commission rate.  This adapter
 * therefore reports the actual transfers: treasury receipts as protocol
 * revenue and the immediately following referral payout as supply-side
 * revenue.  No internal user, referral, or application data is queried.
 */
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryAllium } from "../helpers/allium";

// https://solscan.io/account/BGP8a4yW8THuUZaq2TxVPU6KjHXi7G4McRyz333uuqNr
const TREASURY = "BGP8a4yW8THuUZaq2TxVPU6KjHXi7G4McRyz333uuqNr";
// https://solscan.io/account/LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo
const METEORA_DLMM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
// https://solscan.io/account/cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG
const METEORA_DAMM_V2 = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";

const LABEL = "Meteora Liquidity-Management Fees";
const REFERRAL_LABEL = "Referral Payouts";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const timeRange =
    "block_timestamp >= TO_TIMESTAMP_NTZ(" +
    options.startTimestamp +
    ") AND block_timestamp < TO_TIMESTAMP_NTZ(" +
    options.endTimestamp +
    ")";

  // program_id includes top-level calls and CPIs. The fee transfer is a
  // top-level System Program transfer appended after the Meteora instructions.
  const query =
    "WITH meteora_transactions AS (" +
    " SELECT txn_id, MAX(instruction_index) AS last_meteora_instruction_index" +
    " FROM solana.raw.instructions" +
    " WHERE parent_tx_success = true AND program_id IN ('" +
    METEORA_DLMM +
    "', '" +
    METEORA_DAMM_V2 +
    "') AND " +
    timeRange +
    " GROUP BY txn_id)," +
    " treasury_receipts AS (" +
    " SELECT t.txn_id, t.from_address, t.instruction_index, t.raw_amount" +
    " FROM solana.assets.transfers t" +
    " INNER JOIN meteora_transactions m ON m.txn_id = t.txn_id" +
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
    "), referral_payouts AS (" +
    " SELECT r.raw_amount" +
    " FROM solana.assets.transfers r" +
    " INNER JOIN treasury_receipts t ON t.txn_id = r.txn_id" +
    " AND t.from_address = r.from_address" +
    " AND r.instruction_index = t.instruction_index + 1" +
    " WHERE r.to_address != '" +
    TREASURY +
    "' AND r.mint = '" +
    ADDRESSES.solana.SOL +
    "' AND r.program_name = 'system' AND r.type = 'transfer'" +
    " AND r.transfer_type = 'sol_transfer' AND " +
    timeRange +
    ") SELECT COALESCE((SELECT SUM(raw_amount) FROM treasury_receipts), 0) AS treasury_amount," +
    " COALESCE((SELECT SUM(raw_amount) FROM referral_payouts), 0) AS referral_amount";

  const [result] = await queryAllium(resultQuery);
  dailyRevenue.add(ADDRESSES.solana.SOL, result?.treasury_amount ?? 0, LABEL);
  dailySupplySideRevenue.add(
    ADDRESSES.solana.SOL,
    result?.referral_amount ?? 0,
    REFERRAL_LABEL,
  );
  dailyFees.addBalances(dailyRevenue);
  dailyFees.addBalances(dailySupplySideRevenue);

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "Native-SOL liquidity-management fees in successful Meteora DLMM or DAMM v2 position transactions: the Valhalla treasury receipt plus an immediately following direct referral payout from the same user. User liquidity is not included as Valhalla TVL.",
  Revenue:
    "The verified fee receipts retained by the Valhalla treasury.",
  ProtocolRevenue:
    "The verified native-SOL liquidity-management fee receipts to the Valhalla treasury.",
  SupplySideRevenue:
    "Direct referral payouts immediately following a matching treasury receipt; these are included in fees but not protocol revenue.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL]: "Native-SOL treasury fee transfers counted only after successful Meteora DLMM or DAMM v2 instructions.",
    [REFERRAL_LABEL]: "Referral payouts paired with a qualifying Valhalla treasury fee transfer.",
  },
  Revenue: {
    [LABEL]: "The portion of those attributable liquidity-management fees received by the Valhalla treasury.",
  },
  ProtocolRevenue: {
    [LABEL]: "The portion of those attributable liquidity-management fees received by the Valhalla treasury.",
  },
  SupplySideRevenue: {
    [REFERRAL_LABEL]: "Direct referral payouts paired with a qualifying Valhalla treasury fee transfer.",
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
