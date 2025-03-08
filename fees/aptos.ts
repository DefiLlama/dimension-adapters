import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { FetchOptions } from "../adapters/types";
import { ProtocolType } from "../adapters/types";
import { queryAllium } from "../helpers/allium";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch: async (options: FetchOptions) => {
        const query = `
        SELECT 
            SUM(gas_used * gas_unit_price) AS tx_fees
        FROM ${options.chain}.raw.transactions
        WHERE block_timestamp >= TO_TIMESTAMP_NTZ(${options.startTimestamp})
        AND block_timestamp < TO_TIMESTAMP_NTZ(${options.endTimestamp})`;
            
        const res = await queryAllium(query);
        const dailyFees = options.createBalances();
        dailyFees.addCGToken('aptos', res[0].tx_fees/10**8)
        return {
            dailyFees,
        }
      },
    },
  },
  version: 2,
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
