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
};

export default adapter;