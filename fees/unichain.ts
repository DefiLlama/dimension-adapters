import { CHAIN } from "../helpers/chains";
import { Dependencies, FetchOptions, ProtocolType, SimpleAdapter } from "../adapters/types";
import { blockscoutFeeAdapter2 } from "../helpers/blockscoutFees";
import { getETHReceived } from "../helpers/token";

const NetFeeSplitter = '0x4300c0d3c0d3c0d3c0d3c0d3c0d3c0d3c0d30004';

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.UNICHAIN]: {
      fetch: async (_a: any, _b: any, options: FetchOptions) => {
        const blockscoutAdapter = blockscoutFeeAdapter2(CHAIN.UNICHAIN)
        const fetchFunction = (blockscoutAdapter.adapter as any)[options.chain].fetch;
        const { dailyFees } = await fetchFunction(_a, _b, options)
        
        const dailyRevenue = options.createBalances()
        if (options.startOfDay >= 1766966400) {
          await getETHReceived({ options, balances: dailyRevenue, target: NetFeeSplitter })
        }

        return { dailyFees, dailyRevenue, dailyHoldersRevenue: dailyRevenue, dailyProtocolRevenue: 0 }
      }
    }
  },
  protocolType: ProtocolType.CHAIN,
  dependencies: [Dependencies.ALLIUM],
}

export default adapter;
