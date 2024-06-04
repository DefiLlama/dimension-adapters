import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface Pool {
    pool: string;
    accured: string;
    paid: string;
}

const methodology = {
    Fees: 'Sum of all fees accrued from LP pools.',
    ProtocolReveneue: '30% of all the fees accrued excluding Community pool.'
}

const urlTotalStats = "https://api.prod.flash.trade/market-stat/revenue-all-time";
const urlDailyStats = "https://api.prod.flash.trade/market-stat/revenue-24hr";

const calculateProtocolRevenue = (stats: Pool[]) => {
    return stats
        .filter(item => item.pool !== "Community.1")
        .reduce((sum, item) => sum + 0.3 * parseFloat(item.accured), 0);
}

const fetchFlashStats = async (timestamp: number): Promise<FetchResultFees> => {
    const totalStatsResponse = await fetchURL(urlTotalStats);
    const dailyStatsResponse = await fetchURL(urlDailyStats);

    const totalStats: Pool[] = totalStatsResponse.data;
    const dailyStats: Pool[] = dailyStatsResponse.data;

    const dailyAccrued = dailyStats.reduce((sum, item) => sum + parseFloat(item.accured), 0);
    const totalAccrued = totalStats.reduce((sum, item) => sum + parseFloat(item.accured), 0);

    const dailyProtocolRevenue = calculateProtocolRevenue(dailyStats);
    const totalProtocolRevenue = calculateProtocolRevenue(totalStats);

    return {
        timestamp,
        dailyFees: dailyAccrued.toString(),
        totalFees: totalAccrued.toString(),
        dailyProtocolRevenue: dailyProtocolRevenue.toString(),
        totalProtocolRevenue: totalProtocolRevenue.toString(),
    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            runAtCurrTime: true,
            customBackfill: undefined,
            fetch: fetchFlashStats,
            start: 0,
            meta: {
                methodology,
            },
        },
    },
};

export default adapter;
