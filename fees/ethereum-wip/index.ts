import { Row } from "@clickhouse/client"
import { FetchOptions, ProtocolType, Adapter } from "../../adapters/types";
import { METRIC } from "../../helpers/metrics";
import { queryClickhouse } from "../../helpers/clickhouse";
import { CHAIN } from "../../helpers/chains";

type FeesRow = Row & {
  total_fees_wei: string;
  base_burn_wei: string;
};

export const SQL_BLOCK_RANGE = `
  SELECT
    CAST(
      sum(toDecimal256(effective_gas_price, 0) * toDecimal256(gas_used, 0))
      AS String
    ) AS total_fees_wei,
    CAST(
      sum(toDecimal256(base_fee_per_gas, 0) * toDecimal256(gas_used, 0))
      AS String
    ) AS base_burn_wei
  FROM evm_indexer.transactions
  WHERE
    chain = {chain:UInt64}
    AND block_number >= {fromBlock:UInt32}
    AND block_number <  {toBlock:UInt32}
`;

export const fetch = async (options: FetchOptions) => {
  const chainId = options.api.chainId
  const fromBlock = await options.getFromBlock()
  const _toBlock = await options.getToBlock()
  const safeBlock = _toBlock - 150

  if (safeBlock <= fromBlock) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue };
  }

  const rows = await queryClickhouse<FeesRow>(SQL_BLOCK_RANGE, {
    chain: chainId,
    fromBlock,
    toBlock: safeBlock,
  });

  const totalFeesWei = BigInt(rows?.[0]?.total_fees_wei ?? "0");
  const baseFeesWei  = BigInt(rows?.[0]?.base_burn_wei  ?? "0");
  const priorityWei  = totalFeesWei - baseFeesWei;

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();

  dailyFees.addGasToken(baseFeesWei, METRIC.TRANSACTION_BASE_FEES);
  dailyFees.addGasToken(priorityWei, METRIC.TRANSACTION_PRIORITY_FEES);
  dailyRevenue.addGasToken(baseFeesWei, METRIC.TRANSACTION_BASE_FEES);

  return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue };
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2015-07-30',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Total ETH gas fees (including base fees and priority fees) paid by users',
    Revenue: 'Amount of ETH base fees that were burned',
    HoldersRevenue: 'Amount of ETH base fees that were burned',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees paid by users',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Total ETH priority fees paid by users',
    },
    Revenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees will be burned',
    },
    HoldersRevenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees will be burned',
    },
  }
}

export default adapter;