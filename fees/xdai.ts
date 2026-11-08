import { FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryClickhouse, Row } from "../helpers/indexer";
import { METRIC } from "../helpers/metrics";

const SQL_GAS_FEES = `
  SELECT t.fees_wei, t.tx_count, t.tx_gas_used, b.block_count, b.header_tx_count, b.header_gas_used
  FROM (
    SELECT
      CAST(sum(toDecimal256(gas_used, 0) * toDecimal256(effective_gas_price, 0)) AS String) AS fees_wei,
      toString(count()) AS tx_count,
      toString(sum(gas_used)) AS tx_gas_used
    FROM evm_indexer.transactions
    WHERE chain = {chain:UInt64}
      AND block_number >= {fromBlock:UInt32}
      AND block_number < {toBlock:UInt32}
  ) AS t
  CROSS JOIN (
    SELECT
      toString(uniqExact(height)) AS block_count,
      toString(sum(tx_count)) AS header_tx_count,
      toString(sum(gasUsed)) AS header_gas_used
    FROM evm_indexer.blocks
    WHERE chain = {chain:UInt64}
      AND height >= {fromBlock:UInt32}
      AND height < {toBlock:UInt32}
  ) AS b
`;

type FeesRow = Row & {
  fees_wei: string;
  tx_count: string;
  tx_gas_used: string;
  block_count: string;
  header_tx_count: string;
  header_gas_used: string;
};

const fetch = async (options: FetchOptions) => {
  const [fromBlock, toBlock] = (await Promise.all([options.getFromBlock(), options.getToBlock()])).map(Number);
  if (!(toBlock > fromBlock)) throw new Error(`xdai: no blocks between ${fromBlock} and ${toBlock}`);

  const rows = await queryClickhouse<FeesRow>(SQL_GAS_FEES, { chain: Number(options.api.chainId), fromBlock, toBlock });
  const row = rows?.[0];
  if (!row || row.fees_wei == null) throw new Error(`xdai: the indexer returned no row for blocks ${fromBlock}-${toBlock}`);

  // the whole window must be indexed: every block header present, and the transactions stored for those blocks add up
  // to the headers' tx count and gas used (the window end can be ahead of the indexer, which runs near the chain head)
  const expectedBlocks = toBlock - fromBlock;
  if (Number(row.block_count) !== expectedBlocks || row.tx_count !== row.header_tx_count || row.tx_gas_used !== row.header_gas_used)
    throw new Error(`xdai: indexer incomplete for blocks ${fromBlock}-${toBlock}: ${row.block_count}/${expectedBlocks} blocks, ${row.tx_count}/${row.header_tx_count} txs, ${row.tx_gas_used}/${row.header_gas_used} gas`);

  const dailyFees = options.createBalances();
  dailyFees.addCGToken("dai", Number(BigInt(row.fees_wei)) / 1e18, METRIC.TRANSACTION_GAS_FEES); // same pricing as the old explorer config

  return { dailyFees, dailyRevenue: options.createBalances(), dailyHoldersRevenue: options.createBalances() };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.XDAI],
  start: "2018-11-01",
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: "Transaction gas fees paid by Gnosis Chain users, in xDAI.",
    Revenue: "No transaction gas fees are counted as chain revenue; the priority fee goes to the validator that produced the block.",
    HoldersRevenue: "No transaction gas fees are counted as GNO holder revenue.",
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_GAS_FEES]: "Gas used multiplied by the effective gas price, summed over every transaction in the window.",
    },
  },
};

export default adapter;
