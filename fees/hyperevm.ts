import { Row } from "@clickhouse/client";
import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryClickhouse } from "../helpers/indexer";
import { METRIC } from "../helpers/metrics";

// Total gas fees preserve the existing gas_used * effective_gas_price calculation.
// Base fees use each transaction's block baseFeePerGas; priority fees are
// derived as total fees minus base fees.
const SQL_GAS_FEES = `
  SELECT
    CAST(sum(toDecimal256(t.gas_used, 0) * toDecimal256(t.effective_gas_price, 0)) AS String) AS total_fees_wei,
    CAST(sum(toDecimal256(t.gas_used, 0) * toDecimal256(b.baseFeePerGas, 0)) AS String) AS base_fees_wei,
    toString(count()) AS tx_count,
    toString(countIf(b.height = t.block_number AND b.baseFeePerGas IS NOT NULL)) AS matched_transactions
  FROM evm_indexer.transactions AS t
  ANY LEFT JOIN evm_indexer.blocks AS b
    ON b.chain = t.chain
    AND b.height = t.block_number
  WHERE t.chain = {chain:UInt64}
    AND t.block_number >= {fromBlock:UInt32}
    AND t.block_number < {toBlock:UInt32}
`;

type FeesRow = Row & {
  total_fees_wei: string;
  base_fees_wei: string;
  tx_count: string;
  matched_transactions: string;
};

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  const fromBlock = Number(options.fromApi.block);
  const safeBlock = Number(options.toApi.block) - 50;
  if (safeBlock <= fromBlock) {
    return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
  }

  const rows = await queryClickhouse<FeesRow>(SQL_GAS_FEES, {
    chain: Number(options.api.chainId),
    fromBlock,
    toBlock: safeBlock,
  });

  const totalFeesWei = BigInt(rows?.[0]?.total_fees_wei ?? "0");
  const baseFeesWei = BigInt(rows?.[0]?.base_fees_wei ?? "0");
  const txCount = Number(rows?.[0]?.tx_count ?? "0");
  const matchedTransactions = Number(rows?.[0]?.matched_transactions ?? "0");

  if (matchedTransactions !== txCount) {
    throw new Error(
      `HyperEVM fee split missing block headers: matched=${matchedTransactions}, txCount=${txCount}`
    );
  }

  if (baseFeesWei > totalFeesWei) {
    throw new Error(
      `HyperEVM base fees exceed total gas fees: base=${baseFeesWei}, total=${totalFeesWei}`
    );
  }

  const priorityFeesWei = totalFeesWei - baseFeesWei;
  dailyFees.addGasToken(baseFeesWei, METRIC.TRANSACTION_BASE_FEES);
  dailyFees.addGasToken(priorityFeesWei, METRIC.TRANSACTION_PRIORITY_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-21',
  protocolType: ProtocolType.CHAIN,
  // isExpensiveAdapter: true,
  methodology: {
    Fees:
      "Total HyperEVM gas fees paid by users, split into EIP-1559 base fees and priority fees.",
    Revenue:
      "All HyperEVM gas fees are burned. Base fees are removed from EVM supply and priority fees are sent to the EVM zero address.",
    HoldersRevenue:
      "All HyperEVM gas fees are burned, reducing HYPE supply.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]:
        "EIP-1559 base fees paid by HyperEVM users.",
      [METRIC.TRANSACTION_PRIORITY_FEES]:
        "Priority fees paid by HyperEVM users.",
    },
    Revenue: {
      [METRIC.TRANSACTION_BASE_FEES]:
        "EIP-1559 base fees burned by removing them from HyperEVM supply.",
      [METRIC.TRANSACTION_PRIORITY_FEES]:
        "HyperEVM priority fees sent to the EVM zero address and burned.",
    },
    HoldersRevenue: {
      [METRIC.TRANSACTION_BASE_FEES]:
        "EIP-1559 base fees burned, reducing HYPE supply.",
      [METRIC.TRANSACTION_PRIORITY_FEES]:
        "HyperEVM priority fees sent to the EVM zero address and burned, reducing HYPE supply.",
    },
  },
}

export default adapter;
