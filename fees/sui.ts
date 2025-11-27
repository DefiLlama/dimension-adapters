import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: async (_:any, _1:any, options: FetchOptions) => {
        const start = new Date(options.fromTimestamp * 1000).toISOString()
        const end = new Date(options.toTimestamp * 1000).toISOString()
        const query = `
            SELECT 
                sum(gas_fees_mist) as tx_fees
            FROM ${options.chain}.raw.transaction_blocks
            where _created_at BETWEEN '${start}' AND '${end}'
            `;
            
        const res = await queryAllium(query);
        const dailyFees = options.createBalances();
        dailyFees.addCGToken('sui', res[0].tx_fees/10**9)
        return {
            dailyFees,
            dailyRevenue: dailyFees
        }
      },
    },
  },
  version: 1,
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
