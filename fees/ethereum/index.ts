// import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
// import { CHAIN } from "../../helpers/chains";
// import { METRIC } from "../../helpers/metrics";
// import { queryIndexer } from '../../helpers/indexer';

// const fetch = async (options: FetchOptions) => {
//   const toBlock = await options.getToBlock()
//   const fromBlock = await options.getFromBlock()
//   const eth_txs: any = await queryIndexer(`
//     SELECT
//       SUM(
//         CASE WHEN (TYPE = 0
//           OR TYPE = 1) THEN
//           gas_price * t.gas_used / 1e18
//         WHEN TYPE = 2
//           AND base_fee_per_gas + t.max_priority_fee_per_gas <= t.max_fee_per_gas THEN
//           (base_fee_per_gas + t.max_priority_fee_per_gas) * t.gas_used / 1e18
//         WHEN TYPE = 2
//           AND base_fee_per_gas + max_priority_fee_per_gas > max_fee_per_gas THEN
//           ((max_fee_per_gas) * (t.gas_used)) / 1e18
//         END) AS txn_fees
//     FROM
//       ethereum.transactions t
//       LEFT JOIN ethereum.blocks b ON block_number = number
//       WHERE t.block_time BETWEEN llama_replace_date_range;`, options);
//   const eth_txs_burn: any = await queryIndexer(`
//     SELECT
//       SUM(eb.base_fee_per_gas * eb.gas_used/1e18) AS daily_eth_burned
//     FROM ethereum.blocks AS eb
//     WHERE eb."number" > 12965000
//       and eb.base_fee_per_gas IS NOT NULL
//       AND eb.gas_used IS NOT NULL
//       and eb.number > ${fromBlock} and eb.number < ${toBlock}`, options);

//   const dailyFees = options.createBalances()
//   const dailyRevenue = options.createBalances()

//   const totalFees = Number(eth_txs[0].txn_fees)
//   const baseFees = Number(eth_txs_burn[0]['daily_eth_burned'])
//   const priorityFees =  totalFees - baseFees

//   dailyFees.addGasToken(baseFees * 10 ** 18, METRIC.TRANSACTION_BASE_FEES)
//   dailyFees.addGasToken(priorityFees * 10 ** 18, METRIC.TRANSACTION_PRIORITY_FEES)

//   dailyRevenue.addGasToken(baseFees * 10 ** 18, METRIC.TRANSACTION_BASE_FEES)
  
//   return {
//     dailyFees,
//     dailyRevenue,
//     dailyHoldersRevenue: dailyRevenue,
//   };
// };

// const adapter: Adapter = {
//   version: 2,
//   adapter: {
//     [CHAIN.ETHEREUM]: {
//       fetch,
//       start: '2015-07-30',
//     },
//   },
//   protocolType: ProtocolType.CHAIN,
//   methodology: {
//     Fees: 'Total ETH gas fees (including base fees and priority fees) paid by users',
//     Revenue: 'Amount of ETH base fees that were burned',
//     HoldersRevenue: 'Amount of ETH base fees that were burned',
//   },
//   breakdownMethodology: {
//     Fees: {
//       [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees paid by users',
//       [METRIC.TRANSACTION_PRIORITY_FEES]: 'Total ETH priority fees paid by users',
//     },
//     Revenue: {
//       [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees will be burned',
//     },
//     HoldersRevenue: {
//       [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees will be burned',
//     },
//   }
// }

// export default adapter;

import { Row } from "@clickhouse/client"
import { Dependencies, FetchOptions, ProtocolType, Adapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { queryClickhouse } from "../../helpers/indexer";
import { queryDuneSql } from "../../helpers/dune";
import { CHAIN } from "../../helpers/chains";

type FeesRow = Row & {
  total_fees_wei: string;
  base_burn_wei: string;
};

type BlobFeesRow = { blob_fees_wei: string };

export const SQL_TOTAL_FEES = `
  SELECT
    CAST(
      sum(toDecimal256(effective_gas_price, 0) * toDecimal256(gas_used, 0))
      AS String
    ) AS total_fees_wei
  FROM evm_indexer.transactions
  WHERE
    chain = {chain:UInt64}
    AND block_number >= {fromBlock:UInt32}
    AND block_number <  {toBlock:UInt32}
`;

// because indexer v2 doesn't store blocks, we can't get block base_fee_per_gas
// it also doesn't have base_fee_per_gas in transaction records
// TODO: we do a trick here, get base_fee_per_gas from the minimum effective_gas_price from transactions in block
export const SQL_TOTAL_FEES_BURNED = `
  SELECT
    CAST(
      sum(toDecimal256(base_fee, 0) * toDecimal256(total_gas_used, 0))
      AS String
    ) AS base_burn_wei
  FROM (
    SELECT
      min(effective_gas_price) AS base_fee,
      sum(gas_used) AS total_gas_used
    FROM evm_indexer.transactions
    WHERE
      chain = {chain:UInt64}
      AND block_number >= {fromBlock:UInt32}
      AND block_number <  {toBlock:UInt32}
    GROUP BY block_number
  )
`;

// Blob fees (EIP-4844, live since 2024-03-13). Read from Dune because the
// internal evm_indexer schema doesn't expose blob columns. Sourced from
// `ethereum.blobs_submissions`, which carries the per-tx `blob_gas_used` and
// the receipt-recorded `blob_gas_price` — the latter is authoritative across
// all fork denominators (Cancun, Pectra EIP-7691, Fusaka, EIP-7918 floor),
// so we don't have to track BLOB_BASE_FEE_UPDATE_FRACTION changes ourselves.
// Arithmetic is done in DOUBLE to dodge Trino's DECIMAL multiplication-width
// overflow; the final SUM is cast back to DECIMAL(38,0) for clean integer
// VARCHAR output. Sub-wei rounding from DOUBLE is invisible at daily totals.
const SQL_TOTAL_BLOB_FEES_BURNED = `
  SELECT SUM(blob_gas_used * blob_base_fee) AS blob_fees_wei
  FROM ethereum.blobs_submissions
  WHERE TIME_RANGE
`;

export const fetch = async (options: FetchOptions) => {
  const chainId = options.api.chainId
  const fromBlock = Number(options.fromApi.block)
  
  // delay 50 blocks is acceptable on ethereum from the indexer
  const safeBlock = Number(options.toApi.block) - 50

  if (safeBlock <= fromBlock) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue };
  }

  const [totalFeesRows, totalFeesBurnedRows, blobFeesRows] = await Promise.all([
    queryClickhouse<FeesRow>(SQL_TOTAL_FEES, { chain: chainId, fromBlock, toBlock: safeBlock }),
    queryClickhouse<FeesRow>(SQL_TOTAL_FEES_BURNED, { chain: chainId, fromBlock, toBlock: safeBlock }),
    queryDuneSql(options, SQL_TOTAL_BLOB_FEES_BURNED) as Promise<BlobFeesRow[]>,
  ]);

  const totalFeesWei = BigInt(totalFeesRows?.[0]?.total_fees_wei ?? "0");
  const baseFeesWei  = BigInt(totalFeesBurnedRows?.[0]?.base_burn_wei ?? "0");
  const priorityWei  = totalFeesWei - baseFeesWei;
  const blobFeesWei  = BigInt(blobFeesRows?.[0]?.blob_fees_wei ?? "0");

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addGasToken(baseFeesWei, METRIC.TRANSACTION_BASE_FEES);
  dailyFees.addGasToken(priorityWei, METRIC.TRANSACTION_PRIORITY_FEES);
  dailyFees.addGasToken(blobFeesWei, METRIC.TRANSACTION_BLOB_FEES);

  // Blob fees, like base fees, are permanently burned — they accrue to no
  // proposer / no validator. Treat them the same way in the revenue split.
  dailyRevenue.addGasToken(baseFeesWei, METRIC.TRANSACTION_BASE_FEES);
  dailyRevenue.addGasToken(blobFeesWei, METRIC.TRANSACTION_BLOB_FEES);

  return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue };
}

const adapter: Adapter = {
  version: 2,
  fetch,
  start: '2015-07-30',
  chains: [CHAIN.ETHEREUM],
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.DUNE],
  methodology: {
    Fees: 'Total ETH gas fees (base fees + priority fees) plus blob fees (post-EIP-4844, type-3 blob-carrying transactions) paid by users',
    Revenue: 'Amount of ETH burned — base fees plus blob fees (both are permanently burned, accruing to no proposer)',
    HoldersRevenue: 'Amount of ETH burned — base fees plus blob fees',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees paid by users',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Total ETH priority fees paid by users',
      [METRIC.TRANSACTION_BLOB_FEES]: 'Total ETH blob fees paid by users on type-3 transactions (EIP-4844, live since 2024-03-13)',
    },
    Revenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees burned',
      [METRIC.TRANSACTION_BLOB_FEES]: 'Total ETH blob fees burned',
    },
    HoldersRevenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees burned',
      [METRIC.TRANSACTION_BLOB_FEES]: 'Total ETH blob fees burned',
    },
  }
}

export default adapter;
