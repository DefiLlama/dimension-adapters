import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryIndexer } from '../../helpers/indexer';

const fetch = async (options: FetchOptions) => {
  const toBlock = await options.getToBlock()
  const fromBlock = await options.getFromBlock()
  const eth_txs: any = await queryIndexer(`
    SELECT
      SUM(
        CASE WHEN (TYPE = 0
          OR TYPE = 1) THEN
          gas_price * t.gas_used / 1e18
        WHEN TYPE = 2
          AND base_fee_per_gas + t.max_priority_fee_per_gas <= t.max_fee_per_gas THEN
          (base_fee_per_gas + t.max_priority_fee_per_gas) * t.gas_used / 1e18
        WHEN TYPE = 2
          AND base_fee_per_gas + max_priority_fee_per_gas > max_fee_per_gas THEN
          ((max_fee_per_gas) * (t.gas_used)) / 1e18
        END) AS txn_fees,
      SUM(
        CASE WHEN TYPE = 3 THEN
          COALESCE(blob_gas_used * blob_gas_price / 1e18, 0)
        ELSE 0
        END) AS blob_fees
    FROM
      ethereum.transactions t
      LEFT JOIN ethereum.blocks b ON block_number = number
      WHERE t.block_time BETWEEN llama_replace_date_range;`, options);
  const eth_txs_burn: any = await queryIndexer(`
    SELECT
      SUM(eb.base_fee_per_gas * eb.gas_used/1e18) AS daily_eth_burned
    FROM ethereum.blocks AS eb
    WHERE eb."number" > 12965000
      and eb.base_fee_per_gas IS NOT NULL
      AND eb.gas_used IS NOT NULL
      and eb.number > ${fromBlock} and eb.number < ${toBlock}`, options);

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const totalFees = Number(eth_txs[0].txn_fees)
  const baseFees = Number(eth_txs_burn[0]['daily_eth_burned'])
  const blobFees = Number(eth_txs[0].blob_fees)
  const priorityFees =  totalFees - baseFees

  dailyFees.addGasToken(baseFees * 10 ** 18, METRIC.TRANSACTION_BASE_FEES)
  dailyFees.addGasToken(priorityFees * 10 ** 18, METRIC.TRANSACTION_PRIORITY_FEES)
  dailyFees.addGasToken(blobFees * 10 ** 18, METRIC.TRANSACTION_BLOB_FEES)

  dailyRevenue.addGasToken(baseFees * 10 ** 18, METRIC.TRANSACTION_BASE_FEES)
  dailyRevenue.addGasToken(blobFees * 10 ** 18, METRIC.TRANSACTION_BLOB_FEES)
  
  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
};

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
    Fees: 'Total ETH gas fees (including base fees, priority fees, and blob fees) paid by users',
    Revenue: 'Amount of ETH base fees and blob fees that were burned',
    HoldersRevenue: 'Amount of ETH base fees and blob fees that were burned',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees paid by users',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Total ETH priority fees paid by users',
      [METRIC.TRANSACTION_BLOB_FEES]: 'Total ETH blob fees paid by users for blob transactions (EIP-4844)',
    },
    Revenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees will be burned',
      [METRIC.TRANSACTION_BLOB_FEES]: 'Total ETH blob fees will be burned',
    },
    HoldersRevenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total ETH base fees will be burned',
      [METRIC.TRANSACTION_BLOB_FEES]: 'Total ETH blob fees will be burned',
    },
  }
}

export default adapter;
