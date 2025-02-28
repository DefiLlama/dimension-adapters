import { SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchTransactionFees } from "../helpers/getChainFees";
import { FetchOptions } from "../adapters/types";
import { ProtocolType } from "../adapters/types";

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BERACHAIN]: {
      fetch: async (options: FetchOptions) => {
        return {
            dailyFees: await fetchTransactionFees(options),
        }
      },
      start: "2025-02-05",
    },
  },
  version: 2,
  isExpensiveAdapter: true,
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
