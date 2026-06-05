import { Row } from "@clickhouse/client";
import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryClickhouse } from "../helpers/indexer";
import { METRIC } from "../helpers/metrics";

// Replaces the prior Dune query:
//   SELECT SUM(gas_price * gas_used) FROM hyperevm.transactions
//   WHERE block_time BETWEEN <day>
// Direct mapping into the indexer's `evm_indexer.transactions`. Uses
// `effective_gas_price` (which equals `gas_price` on HyperEVM for legacy txs
// and is the actually-paid price on EIP-1559 txs).
const SQL_GAS_FEES = `
  SELECT
    CAST(sum(toDecimal256(gas_used, 0) * toDecimal256(effective_gas_price, 0)) AS String) AS gas_fees_wei
  FROM evm_indexer.transactions
  WHERE chain = {chain:UInt64}
    AND block_number >= {fromBlock:UInt32}
    AND block_number <  {toBlock:UInt32}
`;

type FeesRow = Row & { gas_fees_wei: string };

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

  const gasFeesWei = BigInt(rows?.[0]?.gas_fees_wei ?? "0");
  dailyFees.addGasToken(gasFeesWei, METRIC.TRANSACTION_GAS_FEES);

  return { dailyFees, dailyRevenue: dailyFees, dailyHoldersRevenue: dailyFees };
};

const adapter: Adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.HYPERLIQUID],
  start: '2025-02-21',
  protocolType: ProtocolType.CHAIN,
  // isExpensiveAdapter: true,
}

export default adapter;
