import { CHAIN } from "../../helpers/chains";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const volumeURL = "https://mclmm-api.stabble.org/protocol-metrics";

interface DailyStats {
    volume: number;
    fees: number;
    revenue: number;
}

const fetch = async (options: FetchOptions) => {
    const startDate = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
    const url = `${volumeURL}?startTimestamp=${startDate}&endTimestamp=${startDate}`;

    const stats: DailyStats = await fetchURL(url);

    return {
        dailyVolume: stats.volume,
        dailyFees: stats.fees,
        dailyRevenue: stats.revenue,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: '2025-12-12',
    // The CLMM program 6dMXqGZ3ga2dikrYS9ovDXgHGh5RUsb2RTUj6hrQXhk6 is still
    // deployed but its last transaction was 2026-06-30. mclmm-api.stabble.org
    // now 404s on every path including the root, so there is nothing left to
    // read. The AMM (dexs/stabble) is unaffected and still reporting.
    deadFrom: '2026-06-30',
};

export default adapter;