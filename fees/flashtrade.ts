import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface Pool {
    poolName: string;
    date: string;
    totalRevenue: string;
    totalProtocolFee: string;
}

const methodology = {
    Fees: 'Sum of all fees accrued from LP pools.',
    ProtocolReveneue: '30% of all the fees accrued excluding Community pool.'
}

const urlDailyStats = "https://api.prod.flash.trade/protocol-fees/daily";

const calculateProtocolRevenue = (stats: Pool[]) => {
    return stats
        .filter(item => item.poolName !== "Community.1")
        .reduce((sum, item) => sum + 0.3 * parseFloat(item.totalProtocolFee), 0);
}

const fetchFlashStats = async (_: number): Promise<FetchResultFees> => {
    const dailyStatsResponse = await fetchURL(urlDailyStats);
    const dailyStats: Pool[] = dailyStatsResponse;
    
    // Find the most recent date in the data
    const mostRecentDate = dailyStats.reduce((latest, item) => {
        return item.date > latest ? item.date : latest;
    }, dailyStats[0]?.date || "");
    
    // Filter to only include entries from the most recent date
    const todayStats = dailyStats.filter(item => item.date === mostRecentDate);
    
    const dailyAccrued = (todayStats.reduce((sum, item) => sum + parseFloat(item.totalProtocolFee), 0));
    const dailyProtocolRevenue = calculateProtocolRevenue(todayStats);

    return {
        dailyFees: (dailyAccrued * 10**-6).toString(),
        dailyRevenue: (dailyProtocolRevenue * 10**-6).toString(),
        dailyProtocolRevenue: (dailyProtocolRevenue * 10**-6).toString(),
    };
};

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            runAtCurrTime: true,
            fetch: fetchFlashStats,
            meta: { methodology },
        },
    },
};

export default adapter;
