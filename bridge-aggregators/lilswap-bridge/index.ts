import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { fetchLilSwapDailyMetrics, lilswapChainAliases } from "../../helpers/aggregators/lilswap";

const LABELS = {
    FEES: "Bridge Fees",
    REVENUE: "Bridge Fees To Protocol",
    SUPPLY_SIDE: "Bridge Fees To Partners",
}

// Bridges are attributed to the source chain by LilSwap's metrics endpoint.
async function fetch(options: FetchOptions) {
    const dailyBridgeVolume = options.createBalances();
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    const bridge = (await fetchLilSwapDailyMetrics(options))?.bridge;

    if (bridge) {
        dailyBridgeVolume.addUSDValue(Number(bridge.volumeUsd));
        dailyFees.addUSDValue(Number(bridge.feesUsd), LABELS.FEES);
        dailyRevenue.addUSDValue(Number(bridge.revenueUsd), LABELS.REVENUE);
        dailySupplySideRevenue.addUSDValue(Number(bridge.supplySideRevenueUsd), LABELS.SUPPLY_SIDE);
    }

    return { dailyBridgeVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
}

const methodology = {
    BridgeVolume: "Volume of completed cross-chain transfers routed through LilSwap, counted on the source chain.",
    Fees: "Bridge fees paid by users on completed transfers.",
    UserFees: "Bridge fees paid by users on completed transfers.",
    Revenue: "Bridge fees retained by LilSwap after partner share.",
    ProtocolRevenue: "Bridge fees retained by LilSwap after partner share.",
    SupplySideRevenue: "Bridge fees paid to bridge providers and partners.",
}

const breakdownMethodology = {
    Fees: {
        [LABELS.FEES]: "Bridge fees paid by users on completed transfers.",
    },
    UserFees: {
        [LABELS.FEES]: "Bridge fees paid by users on completed transfers.",
    },
    Revenue: {
        [LABELS.REVENUE]: "Bridge fees retained by LilSwap after partner share.",
    },
    ProtocolRevenue: {
        [LABELS.REVENUE]: "Bridge fees retained by LilSwap after partner share.",
    },
    SupplySideRevenue: {
        [LABELS.SUPPLY_SIDE]: "Bridge fees paid to bridge providers and partners.",
    },
}

const adapter: SimpleAdapter = {
    fetch,
    start: '2026-07-04',
    chains: Object.keys(lilswapChainAliases),
    methodology,
    breakdownMethodology,
}

export default adapter;
