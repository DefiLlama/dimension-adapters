import ADDRESSES from '../helpers/coreAssets.json'
import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface Pool {
    poolName: string;
    date: string;
    totalRevenue: string;
    totalProtocolFee: string;
}

const urlDailyStats = "https://api.prod.flash.trade/protocol-fees/daily";

const calculateProtocolRevenue = (stats: Pool[]) => {
    return stats
        .filter(item => item.poolName !== "Community.1")
        .reduce((sum, item) => sum + 0.3 * parseFloat(item.totalProtocolFee), 0);
}

const fetchFlashStats = async (options: FetchOptions): Promise<FetchResultFees> => {
    const timestamp = options.startOfDay;
    
    const dailyStatsResponse = await fetchURL(urlDailyStats);
    const dailyStats: Pool[] = dailyStatsResponse;
    
    // Convert timestamp to date string format matching the API data
    const targetDate = new Date(timestamp * 1000).toISOString().split('T')[0];
    
    // Filter to only include entries from the target date
    const todayStats = dailyStats.filter(item => {
        const itemDate = new Date(item.date).toISOString().split('T')[0];
        return itemDate === targetDate;
    });
    
    const dailyAccrued = (todayStats.reduce((sum, item) => sum + parseFloat(item.totalProtocolFee), 0));
    const dailyProtocolRevenue = calculateProtocolRevenue(todayStats);

    return {
        dailyFees: (dailyAccrued * 10**-6).toString(),
        dailyRevenue: (dailyProtocolRevenue * 10**-6).toString(),
        dailyProtocolRevenue: (dailyProtocolRevenue * 10**-6).toString(),

    };
};

const methodology = {
    Fees: 'Sum of all fees accrued from LP pools.',
    Revenue: 'Sum of protocol revenue and holder revenue.',
    ProtocolRevenue: '30% of all the fees accrued excluding Community pool.',
    HolderRevenue: '50% of revenue goes to token stakers.',
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch: fetchFlashStats,
            runAtCurrTime: true,
            meta: { methodology },
        },
    },
};

export default adapter;