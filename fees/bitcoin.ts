import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(CHAIN.BITCOIN, "btc", 1230958800);

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.BITCOIN]: {
      fetch: async (timestamp: number, _a: any, options: FetchOptions) => {
        const baseData = await feeAdapter[CHAIN.BITCOIN].fetch(timestamp);
        const dailyFees = options.createBalances();
        dailyFees.addCGToken("bitcoin", baseData.dailyFees)
        return { dailyFees, dailyRevenue: 0 }
      },
      start: '2009-01-03'
    }
  },
  protocolType: ProtocolType.CHAIN
}

export default adapter;
