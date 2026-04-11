import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { fetchLilSwapDailyMetrics, getLilSwapFees } from "../../helpers/lilswap";

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.BASE,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
  CHAIN.OPTIMISM,
  CHAIN.XDAI,
  CHAIN.SONIC,
];

const LABELS = {
  FEES: "Explicit Swap Fees",
  REVENUE: "LilSwap Retained Fees",
  SUPPLY_SIDE: "External Fee Share",
} as const;

const adapter: Adapter = {
  version: 2,
  chains,
  start: "2025-01-01",
  methodology: {
    Fees: "Includes explicit LilSwap fees from confirmed swaps sourced from LilSwap's public daily metrics endpoint. Zero-fee swaps remain in volume but do not contribute to fees.",
    UserFees: "Users pay LilSwap's explicit swap fees on confirmed swaps, sourced from LilSwap's public daily metrics endpoint.",
    Revenue: "LilSwap retains 85% of explicit fees, sourced from LilSwap's public daily metrics endpoint.",
    ProtocolRevenue: "Same as LilSwap daily revenue because the endpoint reports LilSwap's retained fee share directly.",
    SupplySideRevenue: "Represents the 15% non-LilSwap side of the explicit fee split, sourced from LilSwap's public daily metrics endpoint.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.FEES]: "Explicit LilSwap swap fees charged on confirmed swaps.",
    },
    UserFees: {
      [LABELS.FEES]: "Explicit LilSwap swap fees paid by users on confirmed swaps.",
    },
    Revenue: {
      [LABELS.REVENUE]: "LilSwap's retained 85% share of explicit swap fees.",
    },
    ProtocolRevenue: {
      [LABELS.REVENUE]: "LilSwap's retained 85% share of explicit swap fees.",
    },
    SupplySideRevenue: {
      [LABELS.SUPPLY_SIDE]: "The 15% non-LilSwap side of the explicit fee split.",
    },
  },
  fetch: async (options: FetchOptions) => {
    const row = await fetchLilSwapDailyMetrics(options);
    const metrics = getLilSwapFees(row);

    const dailyFees = options.createBalances();
    const dailyUserFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyFees.addUSDValue(metrics.dailyFees, LABELS.FEES);
    dailyUserFees.addUSDValue(metrics.dailyUserFees, LABELS.FEES);
    dailyRevenue.addUSDValue(metrics.dailyRevenue, LABELS.REVENUE);
    dailyProtocolRevenue.addUSDValue(metrics.dailyProtocolRevenue, LABELS.REVENUE);
    dailySupplySideRevenue.addUSDValue(metrics.dailySupplySideRevenue, LABELS.SUPPLY_SIDE);

    return {
      dailyFees,
      dailyUserFees,
      dailyRevenue,
      dailyProtocolRevenue,
      dailySupplySideRevenue,
    };
  },
};

export default adapter;
