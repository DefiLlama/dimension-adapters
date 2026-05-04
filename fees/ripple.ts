import { Adapter, FetchOptions, FetchResultFees, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

// Ripple launched in 2012, using approximate launch date
const feeAdapter = chainAdapter(CHAIN.RIPPLE, "xrp", 1338508800);

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.RIPPLE]: {
      fetch: async (timestamp: number, _a: any, options: FetchOptions) => {
        const baseData = await feeAdapter[CHAIN.RIPPLE].fetch(timestamp);
        const dailyFees = options.createBalances();
        dailyFees.addCGToken("ripple", baseData.dailyFees)
        return { dailyFees, dailyRevenue: 0 }
      },
      start: '2012-06-01'
    }
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;