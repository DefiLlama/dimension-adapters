import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { ETHEREUM } from "../../helpers/chains";
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
        END) AS txn_fees
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

  const dailyRev = options.createBalances()
  dailyRev.addGasToken(eth_txs_burn[0]['daily_eth_burned'] * 10 ** 18)
  const dailyFee = options.createBalances()
  dailyFee.addGasToken(Number(eth_txs[0].txn_fees) * 10 ** 18)
  return {
    dailyFees: dailyFee,
    dailyRevenue: dailyRev,
    dailyHoldersRevenue: dailyRev,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [ETHEREUM]: {
      fetch,
      start: '2015-07-30',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Total ETH gas fees paid by users',
    Revenue: 'Amount of ETH base fees that were burned',
    HoldersRevenue: 'Amount of ETH base fees that were burned',
  }
}

export default adapter;
