import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter, } from "../helpers/uniswap";
import { METRIC } from "../helpers/metrics";


const methodology = {
  UserFees: "User pays 0.05%, 0.30%, or 1% on each swap.",
  ProtocolRevenue: "Revenue going to the protocol.",
  HoldersRevenue: "User fees are distributed among holders.",
};

const breakdownMethodology = {
  UserFees: {
    [METRIC.SWAP_FEES]: 'Fees paid by users on each swap, with variable rates of 0.05%, 0.30%, or 1% depending on pool tier',
  },
  Revenue: {
    [METRIC.SWAP_FEES]: 'Portion of swap fees kept by the protocol (80% of total), split between token holders and protocol treasury',
  },
  HoldersRevenue: {
    [METRIC.SWAP_FEES]: 'Portion of swap fees distributed to token holders (72% of total fees)',
  },
  ProtocolRevenue: {
    [METRIC.SWAP_FEES]: 'Portion of swap fees retained by protocol treasury (8% of total fees)',
  },
  SupplySideRevenue: {
    [METRIC.LP_FEES]: 'Portion of swap fees distributed to liquidity providers (20% of total fees)',
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.MANTLE]: {
      fetch: async (options: FetchOptions) => {
        const adapter = getUniV3LogAdapter({
          factory: '0xAAA32926fcE6bE95ea2c51cB4Fcb60836D320C42',
        })
        const res = await adapter(options)

        // Create labeled fee balances
        const dailyFees = options.createBalances();
        dailyFees.addBalances(res.dailyFees, METRIC.SWAP_FEES);

        const dailyUserFees = options.createBalances();
        dailyUserFees.addBalances(res.dailyFees, METRIC.SWAP_FEES);

        const dailyRevenue = res?.dailyFees.clone(.8, METRIC.SWAP_FEES)
        const dailyHoldersRevenue = res?.dailyFees.clone(.72, METRIC.SWAP_FEES)
        const dailyProtocolRevenue = res?.dailyFees.clone(.08, METRIC.SWAP_FEES)
        const dailySupplySideRevenue = res?.dailyFees.clone(.2, METRIC.LP_FEES)
        return {
          dailyFees,
          dailyUserFees,
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