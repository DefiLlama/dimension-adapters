import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface Pool {
    pool: string;
    accured: string;
    paid: string;
}

const urlDailyStats = "https://api.prod.flash.trade/market-stat/revenue-24hr";

const calculateProtocolRevenue = (stats: Pool[]) => {
    return stats
        .filter(item => item.pool !== "Community.1")
        .reduce((sum, item) => sum + 0.3 * parseFloat(item.accured), 0);
}

const fetchFlashStats = async (_: number): Promise<FetchResultFees> => {
    const dailyStatsResponse = await fetchURL(urlDailyStats);
    const dailyStats: Pool[] = dailyStatsResponse;
    const dailyAccrued = dailyStats.reduce((sum, item) => sum + parseFloat(item.accured), 0);
    const dailyProtocolRevenue = calculateProtocolRevenue(dailyStats);
    const dailyRevenue = dailyProtocolRevenue * 2;

    return {
        dailyFees: dailyAccrued,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue: dailyProtocolRevenue,
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
            runAtCurrTime: true,
            fetch: fetchFlashStats,
            meta: { methodology },
        },
    },
};

export default adapter;
