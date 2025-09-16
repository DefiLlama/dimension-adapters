import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchBabydogeV4Data } from "../../dexs/babydoge-algebra";
import BigNumber from "bignumber.js";

const adapter: Adapter = {
  adapter: {
    [CHAIN.BSC]: {
      fetch: async (t, _, o) => {
        const res: any = await fetchBabydogeV4Data(t, _, o, "feesUSD");
        const dailyFees = res.dailyFees ?? "0";

        // 3% protocol revenue
        const protocolShare = 0.03;
        const dailyProtocolRevenue = new BigNumber(dailyFees)
          .times(protocolShare)
          .toString();
        
        const dailyRevenue = dailyProtocolRevenue;

        const dailySupplySideRevenue = new BigNumber(dailyFees)
          .minus(dailyProtocolRevenue)
          .toString();
          
        
        return {
          timestamp: res.timestamp,
          dailyFees,
          dailyRevenue,
          dailyProtocolRevenue,
          dailySupplySideRevenue,
        };
      },
      start: 1752537600,
    },
  },

  methodology: {
    Fees: "All swap fees paid by users.",
    Revenue: "Protocol keeps 3% of swap fees as revenue.",
    ProtocolRevenue: "3% of swap fees.",
    SupplySideRevenue: "Remaining 97% of fees.",
  }
};

export default adapter;