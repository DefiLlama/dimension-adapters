import { Adapter, Dependencies, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDuneSql } from "../../helpers/dune";

// https://docs.robinhood.com/chain/protocol-contracts
const ROBINHOOD_ROLLUP_CONTRACTS = [
  "0xBd0D173EEb87D57A09521c24388a12789F33ba96", // Sequencer Inbox (blob-carrying batch posting)
  "0x23A19d23e89166adedbDcB432518AB01e4272D94", // Rollup (assertions and confirmations)
];

const AEP_FEE_SHARE_TO_TREASURY = 0.8;

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
  if (netRevenue > 0n) {
    const aepFee = netRevenue / 10n;
    dailyFees.addGasToken(aepFee, "Robinhood Chain Fees Share")
    dailyRevenue.addGasToken(Number(aepFee) * AEP_FEE_SHARE_TO_TREASURY, "Robinhood Chain Fees Share to Treasury")
    dailySupplySideRevenue.addGasToken(Number(aepFee) * (1 - AEP_FEE_SHARE_TO_TREASURY), "Robinhood Chain Fees Share to Developer Fund")
  }

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
  methodology: {
    Fees: "10% of the net revenue of robinhood chain remitted to the Arbitrum DAO (80%) and developer fund (20%) as part of the Arbitrum Expansion Program.",
    Revenue: "8% of the net revenue of robinhood chain remitted to Arbitrum DAO treasury",
    SupplySideRevenue: "2% of the net revenue of robinhood chain remitted to developer fund",
  },
  breakdownMethodology: {
    Fees: {
      "Robinhood Chain Fees Share": "10% of the net revenue of robinhood chain remitted to the Arbitrum DAO (80%) and developer fund (20%) as part of the Arbitrum Expansion Program.",
    },
    Revenue: {
      "Robinhood Chain Fees Share to Treasury": "8% of the net revenue of robinhood chain remitted to Arbitrum DAO treasury",
    },
    SupplySideRevenue: {
      "Robinhood Chain Fees Share to Developer Fund": "2% of the net revenue of robinhood chain remitted to developer fund",
    },
  },
  doublecounted: true, // robinhood
};

export default adapter;
