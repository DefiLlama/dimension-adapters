import {
  FetchOptions,
  FetchResult,
  SimpleAdapter,
} from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniV3LogAdapter } from "../../helpers/uniswap";

const FACTORY = "0x0Ec554F0BfF0Be6C99d1e95C8015bb0950f6A2C7";
const START = "2026-07-10";

const METRIC = {
  SWAP_FEES: "Token Swap Fees",
  PROTOCOL_REVENUE: "Swap Fees Retained By Protocol",
  HOLDERS_REVENUE: "Swap Fees Used For HOOD Buybacks",
  LP_REVENUE: "Swap Fees To Liquidity Providers",
  HOOD_BUYBACKS: "HOOD Buybacks",
};

const fetchPancakeV3Fork = getUniV3LogAdapter({
  factory: FACTORY,
  userFeesRatio: 1,

  // Project-confirmed policy: SwapHood retains 5% of V3 swap fees and routes
  // 95% to HOOD buybacks for holders. Verified fee-collector deployment:
  // https://robinhoodchain.blockscout.com/address/0x626a38d441620a6c6f151dc97309417165f86f3c?tab=contract
  getRevenueRatio: () => ({
    _revenueRatio: 1,
    _protocolRevenueRatio: 0.05,
    _holdersRevenueRatio: 0.95,
  }),
});

const fetch = async (
  options: FetchOptions,
): Promise<FetchResult> => {
  const stats = await fetchPancakeV3Fork(options);

  const dailyFees = options.createBalances();
  const dailyUserFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  dailyFees.addBalances(
    stats.dailyFees.clone(1, METRIC.SWAP_FEES),
  );

  if (stats.dailyUserFees) {
    dailyUserFees.addBalances(
      stats.dailyUserFees.clone(1, METRIC.SWAP_FEES),
    );
  }

  if (stats.dailyProtocolRevenue) {
    dailyProtocolRevenue.addBalances(
      stats.dailyProtocolRevenue.clone(
        1,
        METRIC.PROTOCOL_REVENUE,
      ),
    );

    dailyRevenue.addBalances(
      stats.dailyProtocolRevenue.clone(
        1,
        METRIC.PROTOCOL_REVENUE,
      ),
    );
  }

  if (stats.dailyHoldersRevenue) {
    dailyHoldersRevenue.addBalances(
      stats.dailyHoldersRevenue.clone(
        1,
        METRIC.HOOD_BUYBACKS,
      ),
    );

    dailyRevenue.addBalances(
      stats.dailyHoldersRevenue.clone(
        1,
        METRIC.HOLDERS_REVENUE,
      ),
    );
  }

  if (stats.dailySupplySideRevenue) {
    dailySupplySideRevenue.addBalances(
      stats.dailySupplySideRevenue.clone(
        1,
        METRIC.LP_REVENUE,
      ),
    );
  }

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

const methodology = {
  Fees:
    "All swap fees paid by users across SwapHood V3 pools. Each pool's configured fee tier is used.",
  UserFees:
    "All swap fees paid directly by SwapHood V3 users.",
  Revenue:
    "SwapHood collects 100% of V3 swap fees. 95% is allocated to HOOD buybacks for holders and 5% is retained by the protocol.",
  ProtocolRevenue:
    "5% of SwapHood V3 swap fees is retained by the protocol.",
  HoldersRevenue:
    "95% of SwapHood V3 swap fees is allocated to HOOD buybacks for holders.",
  SupplySideRevenue:
    "Liquidity providers receive no SwapHood V3 swap fees. LP rewards are provided separately through protocol incentives and are not counted as supply-side revenue.",
};

const breakdownMethodology = {
  Fees: {
    [METRIC.SWAP_FEES]:
      "All swap fees paid by users across SwapHood V3 pools.",
  },
  UserFees: {
    [METRIC.SWAP_FEES]:
      "All swap fees paid directly by SwapHood V3 users.",
  },
  Revenue: {
    [METRIC.PROTOCOL_REVENUE]:
      "5% of SwapHood V3 swap fees retained by the protocol.",
    [METRIC.HOLDERS_REVENUE]:
      "95% of SwapHood V3 swap fees allocated to HOOD buybacks.",
  },
  ProtocolRevenue: {
    [METRIC.PROTOCOL_REVENUE]:
      "5% of SwapHood V3 swap fees retained by the protocol.",
  },
  HoldersRevenue: {
    [METRIC.HOOD_BUYBACKS]:
      "95% of SwapHood V3 swap fees allocated to HOOD buybacks.",
  },
  SupplySideRevenue: {
    [METRIC.LP_REVENUE]:
      "SwapHood V3 liquidity providers receive no swap fees. LP incentives are distributed separately.",
  },
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  start: START,
  methodology,
  breakdownMethodology,
};

export default adapter;
