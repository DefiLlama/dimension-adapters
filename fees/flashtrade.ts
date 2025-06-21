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
    const dailyAccrued = (dailyStats.reduce((sum, item) => sum + parseFloat(item.totalProtocolFee), 0));
    const dailyProtocolRevenue = calculateProtocolRevenue(dailyStats);

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
