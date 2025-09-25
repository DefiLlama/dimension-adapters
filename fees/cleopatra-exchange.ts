import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter, } from "../helpers/uniswap";


const methodology = {
  UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: async (options: FetchOptions) => {
        const adapter = getUniV3LogAdapter({
          factory: '0xAAA32926fcE6bE95ea2c51cB4Fcb60836D320C42',
        })
        const res = await adapter(options)
        const dailyRevenue = res?.dailyFees.clone(.8)
        const dailyHoldersRevenue = res?.dailyFees.clone(.72)
        const dailyProtocolRevenue = res?.dailyFees.clone(.08)
        const dailySupplySideRevenue = res?.dailyFees.clone(.2)
        return {
          ...res,
          dailyRevenue,
          dailyHoldersRevenue,
          dailyProtocolRevenue,
          dailySupplySideRevenue,
          timestamp: options.startOfDay
        }
      },
      start: '2024-01-04',
    }
  }
}

export default adapter