
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
        const date = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
        // https://dune.com/queries/4790401
        const res: { currency: string, total_daily_fee: string }[] = await queryDuneSql(options,
          `select
              case actual_fee_unit
                  when 'WEI' then 'ethereum'
                  when 'FRI' then 'starknet'
              end as currency,
              sum(actual_fee_amount) / pow(10, 18) as total_daily_fee
          from starknet.transactions
          where date_trunc('day', block_date) = date_trunc('day', date '${date}')
          group by actual_fee_unit
        `);
        res.forEach(item => {
          dailyFees.addCGToken(item.currency, Number(item.total_daily_fee))
        })
        return {
          timestamp: options.startOfDay,
          dailyFees,
        }
      }
    },
  },
  isExpensiveAdapter: true,
  dependencies: [Dependencies.DUNE],
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
