import { CHAIN } from "../../helpers/chains";
import { Adapter, FetchOptions, Fetch } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

const volumeURL = "https://mclmm-api.stabble.org/protocol-metrics";

interface DailyStats {
    volume: number;
    fees: number;
    revenue: number;
}

const fetch: Fetch = async (_timestamp, _chainBlocks, options: FetchOptions) => {
    const startDate = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
    const url = `${volumeURL}?startTimestamp=${startDate}&endTimestamp=${startDate}`;

    const stats: DailyStats = await fetchURL(url);

    return {
        dailyVolume: stats.volume,
        dailyFees: stats.fees,
        dailyRevenue: stats.revenue,
    };
};

const adapter: Adapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetch,
            start: '2025-12-12',
        },
    },
};

export default adapter;