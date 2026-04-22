import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { fetchStats, methodology, breakdownMethodology } from "./ramses-hl-cl";
import { METRIC } from "../helpers/metrics";

const fetch = async (_: any, _1: any, options: FetchOptions) => {
    const stats = await fetchStats(options);
    const dailyVolume = stats.clVolumeUSD;

    const dailyFees = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyFees.addUSDValue(stats.clFeesUSD, METRIC.SWAP_FEES);
    dailyHoldersRevenue.addUSDValue(stats.clUserFeesRevenueUSD, 'Swap Fees to holders');
    dailyProtocolRevenue.addUSDValue(stats.clProtocolRevenueUSD, 'Swap Fees to protocol');

    dailyFees.addUSDValue(stats.clBribeRevenueUSD, 'Bribes');
    dailyHoldersRevenue.addUSDValue(stats.clBribeRevenueUSD, 'Bribes to holders');

    const dailyRevenue = dailyProtocolRevenue.clone();
    dailyRevenue.add(dailyHoldersRevenue);

    dailySupplySideRevenue.addUSDValue(stats.clFeesUSD - stats.clUserFeesRevenueUSD - stats.clProtocolRevenueUSD, 'Swap Fees to LPs');

    return {
        dailyVolume,
        dailyFees,
        dailyUserFees: dailyFees,
        dailyHoldersRevenue,
        dailyProtocolRevenue,
        dailyRevenue,
        dailySupplySideRevenue,
    };
};

const adapter: SimpleAdapter = {
    fetch,
    chains: [CHAIN.ARBITRUM],
    start: "2026-01-13",
    methodology,
    breakdownMethodology,
};

export default adapter;
