import ADDRESSES from "../../helpers/coreAssets.json";
import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryAllium } from "../../helpers/allium";

// On Ride Markets, the callers choose coin, duration, direction (up/down) and place a trade from
// treasury. Each trade is executed through our Trade Executor program.
// https://solscan.io/account/tRADeQ3SJVHnFXv1rpwZzVt5HE6DWDu4J6cH34Md6ZA
const TRADE_EXECUTOR = "tRADeQ3SJVHnFXv1rpwZzVt5HE6DWDu4J6cH34Md6ZA";

// Ride Markets collects every fee in USDC into this wallet.
// https://solscan.io/account/ejBYopijneorWAQ1rN6FiZMvmfXbcjcz4mELCNMRsPW
const FEE_WALLET = "ejBYopijneorWAQ1rN6FiZMvmfXbcjcz4mELCNMRsPW";

// Settlement fee schedule, from the program.
const SWAP_FEE_BPS = 70; // 0.7% of the USDC returned to the treasury
const PAYOUT_RATIOS = [9, 99]; // caller share / profit fee, could be either 1% or 10%
const RATIO_TOLERANCE = 0.005; // absorbs the program's integer division

// The treasury is paid `gross - floor(gross * 70 / 10000)`, so its net recovers the gross.
const grossFromNet = (net: number): number => {
  const approx = Math.round(net / (1 - SWAP_FEE_BPS / 10000));
  for (const gross of [approx - 2, approx - 1, approx, approx + 1, approx + 2]) {
    if (gross - Math.floor((gross * SWAP_FEE_BPS) / 10000) === net) return gross;
  }
  return approx;
};

// A settlement instruction pays USDC to the fee wallet, to the treasury, and when the trade closed a linked
// position with profit - to the caller.
// If the trade yields profit, the protocol charges either 1% or 10% profit fees, and the caller's share 
// must then be exactly 99x or 9x that profit fee.
const callerShare = (feeTotal: number, payouts: number[]): number => {
  if (feeTotal <= 0 || payouts.length < 2) return 0;
  let bestError = Infinity;
  let bestCaller = 0;
  for (let i = 0; i < payouts.length; i++) {
    const treasury = payouts[i];
    const profitFee = feeTotal - (grossFromNet(treasury) - treasury);
    if (profitFee <= 0) continue;
    const rest = payouts.reduce((sum, p, j) => (j === i ? sum : sum + p), 0);
    for (const ratio of PAYOUT_RATIOS) {
      const error = Math.abs(rest - profitFee * ratio) / Math.max(rest, 1);
      if (error <= RATIO_TOLERANCE && error < bestError) {
        bestError = error;
        bestCaller = rest;
      }
    }
  }
  return bestCaller;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const timeRange = `block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;

  // One Allium job: settlement legs (program USDC transfers, vault-keyed so two
  // settlements in the same tx stay split) plus fee-wallet inflows on txs that
  // invoke Trade Executor. `create_intent` is a CPI, so match `program_id` on
  // `solana.raw.instructions` rather than scanning `solana.raw.transactions`.
  const query = `
    WITH ride_txs AS (
      SELECT DISTINCT txn_id
      FROM solana.raw.instructions
      WHERE program_id = '${TRADE_EXECUTOR}'
        AND ${timeRange}
    ),
    program_transfers AS (
      SELECT txn_id, from_address, to_address, raw_amount
      FROM solana.assets.transfers
      WHERE outer_program_id = '${TRADE_EXECUTOR}'
        AND mint = '${ADDRESSES.solana.USDC}'
        AND ${timeRange}
    ),
    fee_legs AS (
      SELECT txn_id, from_address AS vault, SUM(raw_amount) AS fee_total
      FROM program_transfers
      WHERE to_address = '${FEE_WALLET}'
      GROUP BY txn_id, from_address
    ),
    payouts AS (
      SELECT txn_id, from_address AS vault, to_address AS recipient, SUM(raw_amount) AS amount
      FROM program_transfers
      WHERE to_address != '${FEE_WALLET}'
      GROUP BY txn_id, from_address, to_address
    ),
    fee_inflows AS (
      SELECT txn_id, raw_amount
      FROM solana.assets.transfers
      WHERE to_address = '${FEE_WALLET}'
        AND from_address != '${FEE_WALLET}'
        AND mint = '${ADDRESSES.solana.USDC}'
        AND ${timeRange}
    )
    SELECT 'settlement' AS kind, f.txn_id AS txn_id, f.vault AS vault, f.fee_total AS fee_total, p.amount AS amount
    FROM fee_legs f
    LEFT JOIN payouts p ON p.txn_id = f.txn_id AND p.vault = f.vault
    UNION ALL
    SELECT 'inflow' AS kind, NULL AS txn_id, NULL AS vault, NULL AS fee_total, COALESCE(SUM(i.raw_amount), 0) AS amount
    FROM fee_inflows i
    INNER JOIN ride_txs r ON r.txn_id = i.txn_id
  `;

  const rows = await queryAllium(query);

  const settlements = new Map<string, { feeTotal: number; payouts: number[] }>();
  let inflowAmount = 0;
  rows.forEach((row: any) => {
    if (String(row.kind).toLowerCase() === "inflow") {
      inflowAmount = Number(row.amount ?? 0);
      return;
    }
    const key = `${row.txn_id}:${row.vault}`;
    if (!settlements.has(key)) settlements.set(key, { feeTotal: Number(row.fee_total), payouts: [] });
    if (row.amount) settlements.get(key)!.payouts.push(Number(row.amount));
  });

  let settlementFees = 0;
  let callerFees = 0;
  settlements.forEach(({ feeTotal, payouts }) => {
    settlementFees += feeTotal;
    callerFees += callerShare(feeTotal, payouts);
  });
  const openingFees = inflowAmount - settlementFees;

  const usdc = ADDRESSES.solana.USDC;
  dailyFees.add(usdc, openingFees, "Trade Opening Fees");
  dailyFees.add(usdc, settlementFees, "Settlement Fees");
  dailyFees.add(usdc, callerFees, "Caller Profit Share");
  dailyRevenue.add(usdc, openingFees, "Trade Opening Fees To Protocol");
  dailyRevenue.add(usdc, settlementFees, "Settlement Fees To Protocol");
  dailySupplySideRevenue.add(usdc, callerFees, "Caller Profit Share To Callers");

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees: "Everything paid to trade on Ride Markets, in USDC: a fee when a trade is opened, a fee when it settles, and the share of the profit paid to the caller who deployed the trade.",
  Revenue: "The opening and settlement fees, which the protocol keeps.",
  ProtocolRevenue: "The opening and settlement fees, which the protocol keeps.",
  SupplySideRevenue: "The profit share paid to callers, which never reaches the protocol.",
};

const breakdownMethodology = {
  Fees: {
    "Trade Opening Fees": "Charged when a trade is opened, based on its volume. Taken by the frontend as a direct USDC transfer to the fee wallet, outside the Trade Executor program, so it is counted only in transactions that invoke that program (including CPI `create_intent`) and only for what the settlement fees do not already account for.",
    "Settlement Fees": "Charged by the Trade Executor program when a trade settles: 0.7% of the USDC returned to the treasury, plus a cut of the caller's profit share.",
    "Caller Profit Share": "Paid out of the treasury's realised profit to the caller who deployed the trade, at a rate the DAO sets. The protocol sets and enforces this rate but does not receive it.",
  },
  Revenue: {
    "Trade Opening Fees To Protocol": "All trade opening fees are paid to the Ride Markets fee wallet.",
    "Settlement Fees To Protocol": "All settlement fees are paid to the Ride Markets fee wallet.",
  },
  ProtocolRevenue: {
    "Trade Opening Fees To Protocol": "All trade opening fees are paid to the Ride Markets fee wallet.",
    "Settlement Fees To Protocol": "All settlement fees are paid to the Ride Markets fee wallet.",
  },
  SupplySideRevenue: {
    "Caller Profit Share To Callers": "Paid straight from the trade's proceeds to the caller, as the cost of sourcing the trade.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  start: "2026-06-11",
  chains: [CHAIN.SOLANA],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  methodology,
  breakdownMethodology,
};

export default adapter;
