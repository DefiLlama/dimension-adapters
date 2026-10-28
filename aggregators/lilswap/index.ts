import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchLilSwapDailyMetrics, lilswapChainAliases } from "../../helpers/aggregators/lilswap";

const LABELS = {
    FEES: "Swap Fees",
    REVENUE: "Swap Fees To Protocol",
    SUPPLY_SIDE: "Swap Fees To Partners",
}

async function fetch(options: FetchOptions) {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyVolume = options.createBalances();

    const todaysData = await fetchLilSwapDailyMetrics(options);

    if (todaysData) {
        dailyFees.addUSDValue(Number(todaysData.feesUsd), LABELS.FEES);
        dailyRevenue.addUSDValue(Number(todaysData.revenueUsd), LABELS.REVENUE);
        dailySupplySideRevenue.addUSDValue(Number(todaysData.supplySideRevenueUsd), LABELS.SUPPLY_SIDE);
        dailyVolume.addUSDValue(Number(todaysData.volumeUsd));
    }

    return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
    Volume: "Volume of confirmed swaps routed through LilSwap, including Aave collateral and debt swaps, market and limit orders, and spot swaps.",
    Fees: "Swap fees paid by users, including LilSwap's explicit fee and surplus share.",
    UserFees: "Users pay LilSwap's swap fees on confirmed swaps.",
    Revenue: "Swap fees retained by LilSwap after partner share.",
    ProtocolRevenue: "Same as revenue.",
    SupplySideRevenue: "Swap fees paid to routing and liquidity partners.",
}

const breakdownMethodology = {
    Fees: {
        [LABELS.FEES]: "Swap fees paid by users, including LilSwap's explicit fee and surplus share.",
    },
    UserFees: {
        [LABELS.FEES]: "Swap fees paid by users, including LilSwap's explicit fee and surplus share.",
    },
    Revenue: {
        [LABELS.REVENUE]: "Swap fees retained by LilSwap after partner share.",
    },
    ProtocolRevenue: {
        [LABELS.REVENUE]: "Swap fees retained by LilSwap after partner share.",
    },
    SupplySideRevenue: {
        [LABELS.SUPPLY_SIDE]: "Swap fees paid to routing and liquidity partners.",
    },
}

const adapter: SimpleAdapter = {
    fetch,
    start: '2026-02-21',
    chains: Object.keys(lilswapChainAliases),
    methodology,
    breakdownMethodology,
}

export default adapter;
