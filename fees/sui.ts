import { Dependencies, SimpleAdapter, ProtocolType, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryAllium } from "../helpers/allium";

const fetch = async (options: FetchOptions) => {
  // storage cost is a deposit that is rebated when the object is deleted, so only computation and the
  // non-refundable part are counted; gas_fees_mist nets rebates against new storage and goes negative
  // on deletion-heavy hours
  const query = `
    WITH totals AS (
      SELECT
        sum(gas_computation_cost) AS computation_fees,
        sum(gas_non_refundable_storage_fee) AS storage_fee_burnt,
        min(checkpoint_sequence) AS first_checkpoint,
        max(checkpoint_sequence) AS last_checkpoint,
        count(DISTINCT checkpoint_sequence) AS checkpoints
      FROM ${options.chain}.raw.transaction_blocks
      WHERE checkpoint_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND checkpoint_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})
    ),
    edges AS (
      -- 1h either side bounds the scan (table is clustered on checkpoint_timestamp); a chain halt longer than that
      -- across the window boundary would need a wider range
      SELECT count(DISTINCT t.checkpoint_sequence) AS edge_checkpoints
      FROM ${options.chain}.raw.transaction_blocks t, totals
      WHERE ((t.checkpoint_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp - 3600}) AND t.checkpoint_timestamp < TO_TIMESTAMP_NTZ(${options.startTimestamp}))
          OR (t.checkpoint_timestamp >= TO_TIMESTAMP_NTZ(${options.endTimestamp}) AND t.checkpoint_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp + 3600})))
        AND t.checkpoint_sequence IN (totals.first_checkpoint - 1, totals.last_checkpoint + 1)
    )
    SELECT * FROM totals, edges
  `;

  const res = await queryAllium(query);
  const row = res[0];
  const missingCheckpoints = Number(row?.last_checkpoint) - Number(row?.first_checkpoint) + 1 - Number(row?.checkpoints);
  if (!row || missingCheckpoints !== 0 || Number(row.edge_checkpoints) !== 2)
    throw new Error(`Allium has not indexed every Sui checkpoint in ${options.startTimestamp}-${options.endTimestamp} yet (missing in window: ${missingCheckpoints}, edge checkpoints found: ${row?.edge_checkpoints}/2)`);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  if (row.computation_fees == null)
    throw new Error(`Allium returned no Sui transactions for ${options.startTimestamp}-${options.endTimestamp}`);
  const computationFees = Number(row.computation_fees) / 10 ** 9;
  if (row.storage_fee_burnt == null)
    throw new Error(`Allium returned no Sui storage fee total for ${options.startTimestamp}-${options.endTimestamp}`);
  const storageFeeBurnt = Number(row.storage_fee_burnt) / 10 ** 9;

  dailyFees.addCGToken('sui', computationFees, 'Transaction Gas Fees');
  dailyFees.addCGToken('sui', storageFeeBurnt, 'Transaction Storage Fees');
  dailyRevenue.addCGToken('sui', storageFeeBurnt, 'Transaction Storage Fees');
  dailySupplySideRevenue.addCGToken('sui', computationFees, 'Transaction Gas Fees');

  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue.clone(),
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Computation fees plus non refundable storage fees paid by users for executing transactions on the Sui network. Refundable storage deposits are excluded.",
  Revenue: "Non refundable storage fees, retained permanently in the storage fund (never refunded or withdrawn)",
  HoldersRevenue: "Non refundable storage fees, retained permanently in the storage fund (never refunded or withdrawn)",
  SupplySideRevenue: "Computation fees, paid out to validators and stakers at the end of each epoch",
}

const adapter: SimpleAdapter = {
  // version 1 (one daily query) instead of hourly: Allium lands a few Sui checkpoints hours late, so hourly slices
  // would throw on the completeness check run after run, re-running the expensive query each hour
  version: 1,
  fetch,
  chains: [CHAIN.SUI],
  dependencies: [Dependencies.ALLIUM],
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
  methodology,
  start: '2024-06-01',
  breakdownMethodology: {
    Fees: {
      'Transaction Gas Fees': 'Computation fees paid by users for executing transactions on the Sui network',
      'Transaction Storage Fees': 'Part of the storage deposit that is kept when an object is deleted instead of being rebated',
    },
    Revenue: {
      'Transaction Storage Fees': 'Non refundable storage fees, retained permanently in the storage fund (never refunded or withdrawn)',
    },
    HoldersRevenue: {
      'Transaction Storage Fees': 'Non refundable storage fees, retained permanently in the storage fund (never refunded or withdrawn)',
    },
    SupplySideRevenue: {
      'Transaction Gas Fees': 'Computation fees, paid out to validators and stakers at the end of each epoch',
    },
  }
};

export default adapter;
