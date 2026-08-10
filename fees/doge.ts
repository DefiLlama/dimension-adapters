import { Adapter, FetchOptions, FetchResultFees, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(CHAIN.DOGE, "doge", 1386478800);

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.DOGE]: {
      fetch: async (options: FetchOptions) => {
        const baseData = await feeAdapter[CHAIN.DOGE].fetch(options);
        const dailyFees = options.createBalances();
        dailyFees.addCGToken("dogecoin", baseData.dailyFees)
        return { dailyFees, dailyRevenue: 0 }
      },
      start: '2013-12-08'
    }
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;