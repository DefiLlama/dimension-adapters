import { Adapter, FetchOptions, ProtocolType } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";
import { queryDuneSql } from "../../helpers/dune";

const fetch = async (options: FetchOptions) => {
  const toBlock = await options.getToBlock()
  const fromBlock = await options.getFromBlock()
  const monadTx: any = await queryDuneSql(options,`
    SELECT
      SUM(
        CASE WHEN type = 'DynamicFee'
          AND base_fee_per_gas + t.max_priority_fee_per_gas <= t.max_fee_per_gas THEN
          CAST(base_fee_per_gas + t.max_priority_fee_per_gas as uint256) * CAST(t.gas_limit as uint256) / 1e18
        WHEN type = 'DynamicFee'
          AND base_fee_per_gas + max_priority_fee_per_gas > max_fee_per_gas THEN
          CAST(max_fee_per_gas as uint256) * CAST(t.gas_limit as uint256) / 1e18
        ELSE
          CAST(t.gas_price as uint256) * CAST(t.gas_limit as uint256) / 1e18
        END) AS txn_fees
    FROM
      monad.transactions t
      LEFT JOIN monad.blocks b ON block_number = number
      WHERE TIME_RANGE`);
  const monadTxBurn: any = await queryDuneSql(options, `
    SELECT
      SUM(CAST(eb.base_fee_per_gas as uint256) * CAST(eb.gas_used as uint256)/1e18) AS daily_mon_burned
    FROM monad.blocks AS eb
    WHERE eb.base_fee_per_gas IS NOT NULL
      AND eb.gas_used IS NOT NULL
      and eb.number > ${fromBlock} and eb.number < ${toBlock}`);

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()

  const totalFees = Number(monadTx[0].txn_fees)
  const baseFees = Number(monadTxBurn[0]['daily_mon_burned'])
  const priorityFees = totalFees - baseFees

  dailyFees.addGasToken(baseFees * 10 ** 18, METRIC.TRANSACTION_BASE_FEES)
  dailyFees.addGasToken(priorityFees * 10 ** 18, METRIC.TRANSACTION_PRIORITY_FEES)

  dailyRevenue.addGasToken(baseFees * 10 ** 18, METRIC.TRANSACTION_BASE_FEES)
  
  return {
    dailyFees,
    dailyRevenue,
    dailyHoldersRevenue: dailyRevenue,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.MONAD]: {
      fetch,
      start: '2025-11-24',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Total MON gas fees (including base fees and priority fees) paid by users',
    Revenue: 'Amount of MON base fees that were burned',
    HoldersRevenue: 'Amount of MON base fees that were burned',
  },
  breakdownMethodology: {
    Fees: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total MON base fees paid by users',
      [METRIC.TRANSACTION_PRIORITY_FEES]: 'Total MON priority fees paid by users',
    },
    Revenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total MON base fees will be burned',
    },
    HoldersRevenue: {
      [METRIC.TRANSACTION_BASE_FEES]: 'Total MON base fees will be burned',
    },
  }
}

export default adapter;
