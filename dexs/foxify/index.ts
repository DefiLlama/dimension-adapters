import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { METRIC } from "../../helpers/metrics";

// Source: https://docs.foxify.trade/trading-fees


// Foxify API-based fetch implementation using existing Foxify API
const fetch = async (options: FetchOptions) => {
    // Fetch data from Foxify's existing API endpoint
    const apiResponse = await fetchURL("https://api.foxify.trade/FoxifyStats");

    const dailyVolume = apiResponse.volume?.daily;
    const fees = apiResponse.fees?.daily;
    if (typeof dailyVolume !== "number" || Number.isNaN(dailyVolume) || typeof fees !== "number" || Number.isNaN(fees))
        throw new Error("Invalid Foxify stats API response");

    const growthFees = fees * 0.7;
    const stakerFees = fees * 0.3;

    const dailyFees = options.createBalances();
    const dailyUserFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    dailyFees.addUSDValue(fees, METRIC.TRADING_FEES);
    dailyUserFees.addUSDValue(fees, METRIC.TRADING_FEES);
    dailyRevenue.addUSDValue(growthFees, "Trading Fees To Growth");
    dailyRevenue.addUSDValue(stakerFees, "Trading Fees To FOX Stakers");
    dailyProtocolRevenue.addUSDValue(growthFees, "Trading Fees To Growth");
    dailyHoldersRevenue.addUSDValue(stakerFees, "Trading Fees To FOX Stakers");

    return {
        dailyVolume: dailyVolume,
        dailyFees: dailyFees,
        dailyRevenue: dailyRevenue,
        dailyProtocolRevenue: dailyProtocolRevenue,
        dailyUserFees: dailyUserFees,
        dailyHoldersRevenue: dailyHoldersRevenue,
    };
};

// Foxify methodology
const methodology = {
    Fees: "Trading fees paid by users to open or close Foxify positions.",
    UserFees: "Trading fees paid by users to open or close Foxify positions.",
    Revenue: "All trading fees collected by Foxify, split between Growth and FOX stakers.",
    ProtocolRevenue: "70% of trading fees allocated to Growth.",
    HoldersRevenue: "30% of trading fees used to buy FOX and distribute it to stakers.",
};

const breakdownMethodology = {
    Fees: {
        [METRIC.TRADING_FEES]: "Trading fees paid by users to open or close Foxify positions.",
    },
    UserFees: {
        [METRIC.TRADING_FEES]: "Trading fees paid by users to open or close Foxify positions.",
    },
    Revenue: {
        "Trading Fees To Growth": "70% of trading fees allocated to Growth.",
        "Trading Fees To FOX Stakers": "30% of trading fees used to buy FOX and distribute it to stakers.",
    },
    ProtocolRevenue: {
        "Trading Fees To Growth": "70% of trading fees allocated to Growth.",
    },
    HoldersRevenue: {
        "Trading Fees To FOX Stakers": "30% of trading fees used to buy FOX and distribute it to stakers.",
    },
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.SONIC],
    start: '2025-04-24',
    methodology,
    breakdownMethodology,
    runAtCurrTime: true,
};

export default adapter;
