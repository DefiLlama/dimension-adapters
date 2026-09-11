/**
 * Valhalla — Meteora liquidity-management fees & revenue.
 *
 * Valhalla is a Solana bot that opens, manages, claims and closes user-owned
 * Meteora DLMM positions.  It does not custody position liquidity, so this is
 * a fees/revenue adapter, not a TVL adapter.
 *
 * Each attributable fee is a native-SOL system transfer to the Valhalla
 * treasury, appended to the same successful transaction that invokes either
 * Meteora DLMM or DAMM v2.  Joining receipts to those transactions prevents
 * unrelated receipts to the treasury (for example voluntary developer tips)
 * from being reported as protocol fees.
 *
 * The application charges a percentage of LP fees at claim/close and a small
 * opening fee.  Rates vary by user discount, referrals and a fee cap, so gross
 * fees cannot be safely inferred from a fixed commission rate.  This adapter
 * therefore reports only the net fee receipts retained by Valhalla.  Referral
 * payments are made directly from a user wallet and are deliberately excluded:
 * they do not reach the protocol treasury.
 */
import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import ADDRESSES from "../helpers/coreAssets.json";
import { queryAllium } from "../helpers/allium";

const TREASURY = "BGP8a4yW8THuUZaq2TxVPU6KjHXi7G4McRyz333uuqNr";
const METEORA_DLMM = "LBUZKhRxPF3XUpBCjp4YzTKgLccjZhTSDM9YuVaPwxo";
const METEORA_DAMM_V2 = "cpamdpZCGKUy5JxQXB4dcpGPiikHawvSWAd6mEn1sGG";

const LABEL = "Meteora Liquidity-Management Fees";

const fetch = async (options: FetchOptions) => {
  const dailyRevenue = options.createBalances();
  const timeRange =
    "block_timestamp >= TO_TIMESTAMP_NTZ(" +
    options.startTimestamp +
    ") AND block_timestamp < TO_TIMESTAMP_NTZ(" +
    options.endTimestamp +
    ")";

  // program_id on raw instructions includes both top-level calls and CPIs.
  // The fee transfer itself is a top-level System Program instruction, so it
  // must be associated by transaction id rather than outer_program_id.
  const query =
    "WITH meteora_transactions AS (" +
    " SELECT DISTINCT txn_id" +
    " FROM solana.raw.instructions" +
    " WHERE program_id IN ('" +
    METEORA_DLMM +
    "', '" +
    METEORA_DAMM_V2 +
    "') AND " +
    timeRange +
    ") SELECT COALESCE(SUM(t.raw_amount), 0) AS amount" +
    " FROM solana.assets.transfers t" +
    " INNER JOIN meteora_transactions m ON m.txn_id = t.txn_id" +
    " WHERE t.to_address = '" +
    TREASURY +
    "' AND t.mint = '" +
    ADDRESSES.solana.SOL +
    "' AND " +
    timeRange;

  const [result] = await queryAllium(query);
  dailyRevenue.add(ADDRESSES.solana.SOL, result?.amount ?? 0, LABEL);

  return {
    // Fees are restricted to fees the protocol actually receives.  This avoids
    // overstating the metric by treating direct referral payouts as treasury
    // revenue, or by back-calculating through variable discounts and fee caps.
    dailyFees: dailyRevenue,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
  };
};

const methodology = {
  Fees:
    "Net native-SOL liquidity-management fees received by Valhalla's treasury in successful Meteora DLMM or DAMM v2 position transactions. User liquidity is not included as Valhalla TVL.",
  Revenue:
    "The verified fee receipts retained by the Valhalla treasury. Direct referral payouts are excluded because they never reach the protocol.",
  ProtocolRevenue:
    "The verified native-SOL liquidity-management fee receipts to the Valhalla treasury.",
};

const breakdownMethodology = {
  Fees: {
    [LABEL]: "Native-SOL Valhalla fee transfers to the treasury, counted only when the transaction invokes Meteora DLMM or DAMM v2.",
  },
  Revenue: {
    [LABEL]: "The portion of those attributable liquidity-management fees received by the Valhalla treasury.",
  },
  ProtocolRevenue: {
    [LABEL]: "The portion of those attributable liquidity-management fees received by the Valhalla treasury.",
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
