
import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { ProtocolType } from "../adapters/types";
import { queryDune } from "../helpers/dune";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: async (_t: any,_a: any,options: FetchOptions) => {
        const dailyFees = options.createBalances();
        const date = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
        const res: {currency: string, total_daily_fee: string}[] = await queryDune("4790401", { date: date})
        res.forEach(item => {
            dailyFees.addCGToken(item.currency, Number(item.total_daily_fee))
        })
        return {
            timestamp: options.startOfDay,
            dailyFees: dailyFees,
        }
      }
    },
  },
  version: 1,
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
