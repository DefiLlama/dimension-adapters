import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchTransactionFees } from "../helpers/getChainFees";
import { FetchOptions } from "../adapters/types";
import { ProtocolType } from "../adapters/types";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.METIS]: {
      fetch: async (options: FetchOptions) => {
        return {
            dailyFees: await fetchTransactionFees(options),
        }
      }
    },
  },
  version: 2,
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
