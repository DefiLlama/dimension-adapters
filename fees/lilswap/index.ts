import { Adapter, FetchOptions } from "../../adapters/types";
import { lilswapChainAliases, lilswapSupportedChains } from "../../helpers/lilswapConfig";
import { fetchLilSwapDailyMetrics, getLilSwapFees } from "../../helpers/lilswap";

const LABELS = {
  FEES: "Explicit Swap Fees",
  REVENUE: "Explicit Swap Fees To Protocol",
  SUPPLY_SIDE: "Explicit Swap Fees To External Partners",
} as const;

const adapter: Adapter = {
  version: 2,
  chains: [...lilswapSupportedChains],
  start: "2025-01-01",
  methodology: {
    Fees: "Includes explicit LilSwap fees from confirmed swaps sourced from LilSwap's public daily metrics endpoint. Zero-fee swaps remain in volume but do not contribute to fees.",
    UserFees: "Users pay LilSwap's explicit swap fees on confirmed swaps, sourced from LilSwap's public daily metrics endpoint.",
    Revenue: "LilSwap retained explicit swap fees, sourced from LilSwap's public daily metrics and computed as total explicit fees minus the external partner fee share.",
    ProtocolRevenue: "Same as daily revenue, computed from the explicit fee split as dailyFees minus dailySupplySideRevenue.",
    SupplySideRevenue: "External partner fee share sourced from LilSwap's public daily metrics endpoint.",
  },
  breakdownMethodology: {
    Fees: {
      [LABELS.FEES]: "Explicit LilSwap swap fees charged on confirmed swaps.",
    },
    UserFees: {
      [LABELS.FEES]: "Explicit LilSwap swap fees paid by users on confirmed swaps.",
    },
    Revenue: {
      [LABELS.REVENUE]: "The explicit swap fee share retained by LilSwap.",
    },
    ProtocolRevenue: {
      [LABELS.REVENUE]: "The explicit swap fee share retained by LilSwap.",
    },
    SupplySideRevenue: {
      [LABELS.SUPPLY_SIDE]: "The explicit swap fee share distributed to external partners.",
    },
  },
  fetch: async (options: FetchOptions) => {
    const row = await fetchLilSwapDailyMetrics(options, lilswapChainAliases);
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
