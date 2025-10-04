import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const dailyFees = options.createBalances()
  const query = `
    with tx_ct as (
        select
            block_number
            ,count(*) as ct
            ,SUM((t.gas_used / 1e18) * (t.gas_price - base_fee_per_gas)) as gas_pri_fee
        from ethereum.transactions t
            inner join ethereum.blocks b on block_number = "number"
        where 
            b.date >= from_unixtime(${options.startTimestamp}) 
            AND b.date < from_unixtime(${options.endTimestamp}) 
            AND t.block_date >= from_unixtime(${options.startTimestamp}) 
            AND t.block_date < from_unixtime(${options.endTimestamp})
        group by
            1
    ),
    block_with_eob_payment as (
        select
            t.block_number
            , block_date
            , (value / 1e18) as eob_transfer_value
            , gas_pri_fee
        from ethereum.blocks b
        inner join ethereum.transactions t on b.number = t.block_number
        inner join tx_ct tc on tc.block_number = b.number
        where t."index" = tc.ct - 1
            AND (
                t."from" in (0xAAB27b150451726EC7738aa1d0A94505c8729bd1)
            )
            AND b.date >= from_unixtime(${options.startTimestamp}) 
            AND b.date < from_unixtime(${options.endTimestamp}) 
            AND t.block_date >= from_unixtime(${options.startTimestamp}) 
            AND t.block_date < from_unixtime(${options.endTimestamp})
    )
    select
        sum(eob_transfer_value - gas_pri_fee) as mev_reward
    from block_with_eob_payment
  `
  const res = await queryDuneSql(options, query);

  const dayItem = res[0];
  dailyFees.addGasToken((dayItem?.mev_reward || 0) * 1e18);

  return {
    dailyFees
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  deadFrom: '2025-05-28',
  fetch,
  start: '2022-09-15',
  chains: [CHAIN.ETHEREUM],
  dependencies: [Dependencies.DUNE],
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Total MEV Tips for Eden Builders"
  }
}

export default adapter;
