import { Adapter, FetchOptions, ProtocolType } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { chainAdapter } from "../helpers/getChainFees";

const feeAdapter = chainAdapter(CHAIN.MONERO, "xmr", 1397779200);

const adapter: Adapter = {
  version: 1,
  adapter: {
    [CHAIN.MONERO]: {
      fetch: async (timestamp: number, _a: any, options: FetchOptions) => {
        const baseData = await feeAdapter[CHAIN.MONERO].fetch(timestamp);
        const dailyFees = options.createBalances();
        dailyFees.addCGToken("monero", baseData.dailyFees);
        return { dailyFees, dailyRevenue: 0 };
      },
      start: '2014-04-18',
    },
  },
  protocolType: ProtocolType.CHAIN,
};

export default adapter;
