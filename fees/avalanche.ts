import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTokenDiff } from "../helpers/token";

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.AVAX]: {
      fetch: async (options: FetchOptions) => {
        const dailyFees = await getTokenDiff({ target: '0x0100000000000000000000000000000000000000', includeGasToken: true, options })

        return {
          dailyFees,
          dailyRevenue: dailyFees,
          dailyHoldersRevenue: dailyFees,
        };
      },
      start: '2021-01-01',
    },
  },
  protocolType: ProtocolType.CHAIN,
  methodology: {
    Fees: 'Transaction fees paid by users',
    Revenue: 'Amount of AVAX transaction fees that were burned',
    HoldersRevenue: 'Amount of AVAX transaction fees that were burned',
  }
}

export default adapter;
