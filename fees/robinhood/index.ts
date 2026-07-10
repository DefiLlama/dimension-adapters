import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";
import { METRIC } from "../../helpers/metrics";

const L1_EXECUTION_COSTS = "Ethereum L1 Execution Gas Costs";
const L1_BLOB_COSTS = "Ethereum L1 Blob Data Costs";
const AEP_FEE_SHARE = "Arbitrum Expansion Program Fee Share";
const VALIDATOR_FEES = "Transaction fees to validators";

// https://docs.robinhood.com/chain/protocol-contracts
const ROBINHOOD_ROLLUP_CONTRACTS = [
  "0xBd0D173EEb87D57A09521c24388a12789F33ba96", // Sequencer Inbox (blob-carrying batch posting)
  "0x23A19d23e89166adedbDcB432518AB01e4272D94", // Rollup (assertions and confirmations)
];

const fetch = async (options: FetchOptions) => {
  const contracts = ROBINHOOD_ROLLUP_CONTRACTS.join(", ");

  const query = `
    WITH l2_fees AS (
      SELECT
        CAST(
          COALESCE(SUM(CAST(gas_used AS DECIMAL(38, 0)) * CAST(effective_gas_price AS DECIMAL(38, 0))), 0)
          AS VARCHAR
        ) AS l2_fees_wei
      FROM robinhood.transactions
      WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
    ),
    robinhood_l1_txs AS (
      SELECT
        hash AS tx_hash,
        CAST(gas_used AS DECIMAL(18, 0)) * CAST(gas_price AS DECIMAL(20, 0)) AS execution_fee_wei
      FROM ethereum.transactions
      WHERE block_time >= from_unixtime(${options.startTimestamp})
        AND block_time < from_unixtime(${options.endTimestamp})
        AND success
        AND "to" IN (${contracts})
    ),
    l1_execution_costs AS (
      SELECT
        CAST(
          COALESCE(SUM(execution_fee_wei), CAST(0 AS DECIMAL(38, 0)))
          AS VARCHAR
        ) AS l1_execution_wei
      FROM robinhood_l1_txs
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
      INNER JOIN robinhood_l1_txs rollup_tx ON rollup_tx.tx_hash = b.tx_hash
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

  // Arbitrum Expansion Program: 10% of net revenue (fees minus L1 settlement
  // costs) is remitted to the Arbitrum DAO (8%) and developer fund (2%).
  // https://docs.arbitrum.io/launch-arbitrum-chain/overview/license
  // https://x.com/sgoldfed/status/2074924352659755217
  const netRevenue = l2Fees - l1ExecutionCosts - l1BlobCosts;
  const aepFee = netRevenue > 0n ? netRevenue / 10n : 0n;

  dailyFees.addGasToken(l2Fees, METRIC.TRANSACTION_GAS_FEES);
  dailySupplySideRevenue.addGasToken(netRevenue - aepFee, VALIDATOR_FEES);
  dailySupplySideRevenue.addGasToken(l1ExecutionCosts, L1_EXECUTION_COSTS);
  dailySupplySideRevenue.addGasToken(l1BlobCosts, L1_BLOB_COSTS);
  dailySupplySideRevenue.addGasToken(aepFee, AEP_FEE_SHARE);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: "2026-04-30",
  dependencies: [Dependencies.DUNE],
  protocolType: ProtocolType.CHAIN,
  allowNegativeValue: true,
  methodology: {
    Fees: "Transaction gas fees paid by users on Robinhood Chain (ETH), covering both L2 execution and the L1 data fee component.",
    Revenue: "No revenue",
    SupplySideRevenue: "All transaction fees flow to the supply side, split between validators (net), Ethereum L1 execution and blob costs paid for Robinhood Chain batch posting and rollup assertion transactions, and the 10% Arbitrum Expansion Program share of net revenue paid to the Arbitrum DAO and developer fund.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: "Robinhood Chain L2 transaction gas fees paid by users.",
    },
    SupplySideRevenue: {
      [L1_EXECUTION_COSTS]: "Ethereum execution gas paid by the Robinhood Chain batch poster and validators for L1 batch posting and rollup assertion transactions.",
      [L1_BLOB_COSTS]: "Ethereum blob fees paid for Robinhood Chain blob-carrying batch posting transactions.",
      [AEP_FEE_SHARE]: "10% of net revenue (fees minus L1 settlement costs) remitted under the Arbitrum Expansion Program: 8% to the Arbitrum DAO treasury and 2% to the developer fund.",
      [VALIDATOR_FEES]: "Transaction fees retained by validators, net of Ethereum L1 settlement costs and the Arbitrum Expansion Program fee share.",
    },
  },
};

export default adapter;
