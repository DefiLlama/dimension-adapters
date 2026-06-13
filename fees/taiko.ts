import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";

const L1_EXECUTION_COSTS = "Ethereum L1 Execution Gas Costs";
const L1_BLOB_COSTS = "Ethereum L1 Blob Data Costs";

const TAIKO_ROLLUP_CONTRACTS = [
  "0x06a9Ab27c7e2255df1815E6CC0168d7755Feb19a", // Taiko Inbox
  "0x68d30f47F19c07bCCEf4Ac7FAE2Dc12FCa3e0dC9", // Taiko LabProver
  "0x6f21c543a4af5189ebdb0723827577e1ef57ef1f", // Taiko MainnetInbox
];

const TAIKO_ROLLUP_SELECTORS = [
  "0x47faad14", // proposeBatch(bytes,bytes)
  "0xc9cc2843", // proveBatches(bytes,bytes)
  "0x0cc62b42", // verifyBatches(uint64)
  "0x648885fb", // proposeBlockV2(bytes,bytes)
  "0x0c8f4a10", // proposeBlocksV2(bytes[],bytes[])
  "0xe4882785", // proposeBlocksV2Conditionally(bytes[],bytes[])
  "0x10d008bd", // proveBlock(uint64,bytes)
  "0x440b6e18", // proveBlocks(uint64[],bytes[],bytes)
  "0x9791e644", // propose(bytes,bytes)
  "0xea191743", // prove(bytes,bytes)
];

const asVarbinaryList = (values: string[]) => values.join(", ");

const fetch = async (options: FetchOptions) => {
  const contracts = asVarbinaryList(TAIKO_ROLLUP_CONTRACTS);
  const selectors = asVarbinaryList(TAIKO_ROLLUP_SELECTORS);

  const query = `
    WITH l2_fees AS (
      SELECT
        CAST(
          COALESCE(SUM(CAST(tx_fee_raw AS DECIMAL(38, 0))), 0)
          AS VARCHAR
        ) AS l2_fees_wei
      FROM gas.fees
      WHERE blockchain = 'taiko'
        AND block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
    ),
    taiko_blob_txs AS (
      SELECT DISTINCT tx_hash
      FROM ethereum.blobs_submissions
      WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND blob_submitter_label = 'Taiko'
    ),
    taiko_selector_txs AS (
      SELECT DISTINCT hash AS tx_hash
      FROM ethereum.transactions
      WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND success
        AND "to" IN (${contracts})
        AND bytearray_substring(data, 1, 4) IN (${selectors})
    ),
    taiko_l1_txs AS (
      SELECT tx_hash FROM taiko_blob_txs
      UNION
      SELECT tx_hash FROM taiko_selector_txs
    ),
    l1_execution_costs AS (
      SELECT
        CAST(
          COALESCE(
            SUM(CAST(t.gas_used AS DECIMAL(18, 0)) * CAST(t.gas_price AS DECIMAL(20, 0))),
            CAST(0 AS DECIMAL(38, 0))
          )
          AS VARCHAR
        ) AS l1_execution_wei
      FROM ethereum.transactions t
      INNER JOIN taiko_l1_txs rollup_tx ON rollup_tx.tx_hash = t.hash
      WHERE t.block_time >= from_unixtime(${options.startTimestamp})
        AND t.block_time < from_unixtime(${options.endTimestamp})
    ),
    l1_blob_costs AS (
      SELECT
        CAST(
          COALESCE(
            SUM(CAST(b.blob_gas_used AS DECIMAL(18, 0)) * CAST(b.blob_base_fee AS DECIMAL(20, 0))),
            CAST(0 AS DECIMAL(38, 0))
          )
          AS VARCHAR
        ) AS l1_blob_wei
      FROM ethereum.blobs_submissions b
      INNER JOIN taiko_blob_txs blob_tx ON blob_tx.tx_hash = b.tx_hash
      WHERE b.block_time >= from_unixtime(${options.startTimestamp})
        AND b.block_time < from_unixtime(${options.endTimestamp})
    )
    SELECT
      l2_fees.l2_fees_wei,
      l1_execution_costs.l1_execution_wei,
      l1_blob_costs.l1_blob_wei
    FROM l2_fees
    CROSS JOIN l1_execution_costs
    CROSS JOIN l1_blob_costs
  `;

  const rows = await queryDuneSql(options, query);
  const result = rows[0] ?? {};
  const l2Fees = BigInt(result.l2_fees_wei ?? 0);
  const l1ExecutionCosts = BigInt(result.l1_execution_wei ?? 0);
  const l1BlobCosts = BigInt(result.l1_blob_wei ?? 0);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyL1Costs = options.createBalances();

  dailyFees.addGasToken(l2Fees, METRIC.TRANSACTION_GAS_FEES);
  dailyRevenue.addGasToken(l2Fees, METRIC.TRANSACTION_GAS_FEES);
  dailySupplySideRevenue.addGasToken(l1ExecutionCosts, L1_EXECUTION_COSTS);
  dailySupplySideRevenue.addGasToken(l1BlobCosts, L1_BLOB_COSTS);
  dailyL1Costs.addGasToken(l1ExecutionCosts, L1_EXECUTION_COSTS);
  dailyL1Costs.addGasToken(l1BlobCosts, L1_BLOB_COSTS);
  dailyRevenue.subtract(dailyL1Costs);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TAIKO],
  start: "2024-05-27",
  dependencies: [Dependencies.DUNE],
  protocolType: ProtocolType.CHAIN,
  allowNegativeValue: true,
  methodology: {
    Fees: "Transaction gas fees paid by users on Taiko.",
    Revenue: "Taiko transaction gas fees net of Ethereum L1 posting, proving, and verification costs.",
    SupplySideRevenue: "Ethereum L1 execution gas and blob fees paid for Taiko proposal, proving, and verification transactions.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: "Taiko L2 transaction gas fees paid by users.",
    },
    Revenue: {
      [METRIC.TRANSACTION_GAS_FEES]: "Taiko L2 transaction gas fees paid by users.",
      [L1_EXECUTION_COSTS]: "Ethereum execution gas paid by Taiko proposers and provers for L1 proposal, proving, and verification transactions.",
      [L1_BLOB_COSTS]: "Ethereum blob fees paid for Taiko blob-carrying proposal transactions.",
    },
    SupplySideRevenue: {
      [L1_EXECUTION_COSTS]: "Ethereum execution gas paid by Taiko proposers and provers for L1 proposal, proving, and verification transactions.",
      [L1_BLOB_COSTS]: "Ethereum blob fees paid for Taiko blob-carrying proposal transactions.",
    },
  },
};

export default adapter;
