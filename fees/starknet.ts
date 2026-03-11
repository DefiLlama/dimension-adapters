
import { Dependencies, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { ProtocolType } from "../adapters/types";
import { queryDuneSql } from "../helpers/dune";

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: async (_t: any, _a: any, options: FetchOptions) => {
        const dailyFees = options.createBalances();
        const dailyRevenue = options.createBalances();
        const date = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
        // https://dune.com/queries/4790401
        const res: { currency: string, total_daily_fee: string }[] = await queryDuneSql(options,
          `WITH l2_fees AS (
            select
              case actual_fee_unit
                when 'WEI' then 'ethereum'
                when 'FRI' then 'starknet'
              end as currency,
              sum(actual_fee_amount) / pow(10, 18) as total_daily_fee
            from starknet.transactions
            where date_trunc('day', block_date) = date_trunc('day', date '${date}')
            group by actual_fee_unit
          ),
          l1_costs AS (
            select
              'l1_cost' as currency,
              COALESCE(SUM(tx_fee), 0) as total_daily_fee
            from gas.fees
            where blockchain = 'ethereum'
              and tx_to = 0xc662c410c0ecf747543f5ba90660f6abebd9c8c4
              and block_time >= from_unixtime(${options.startTimestamp})
              and block_time <= from_unixtime(${options.endTimestamp - 1})
          )
          select * from l2_fees
          union all
          select * from l1_costs
        `);
        res.forEach(item => {
          if (item.currency === 'l1_cost') return;
          dailyFees.addCGToken(item.currency, Number(item.total_daily_fee))
        })
        dailyRevenue.addBalances(dailyFees);
        const l1Cost = res.find(item => item.currency === 'l1_cost');
        if (l1Cost) dailyRevenue.addCGToken('ethereum', -Number(l1Cost.total_daily_fee));
        return {
          timestamp: options.startOfDay,
          dailyFees,
          dailyRevenue,
        }
      }
    },
  },
  isExpensiveAdapter: true,
  allowNegativeValue: true, // l1 costs
  dependencies: [Dependencies.DUNE],
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
