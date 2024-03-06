import { Adapter, ChainBlocks, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getTokenDiff } from "../helpers/token";

const adapter: Adapter = {
  adapter: {
    [CHAIN.AVAX]: {
      fetch: async (timestamp: number, _: ChainBlocks, options: FetchOptions) => {
        const dailyFees = await getTokenDiff({ target: '0x0100000000000000000000000000000000000000', includeGasToken: true, options})

        return {
          timestamp,
          dailyFees: dailyFees,
          dailyRevenue: dailyFees,
          dailyHoldersRevenue: dailyFees,
        };
      },
      start: 1609459200
    },
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
