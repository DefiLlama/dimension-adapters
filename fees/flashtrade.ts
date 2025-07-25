import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

interface Pool {
    poolName: string;
    date: string;
    totalRevenue: string;
    totalProtocolFee: string;
}

interface Fees {
    pool: string;
    accured: string;
    paid: string;
    protocolFee: string;
    feesPaidToLP: string;
}

const urlRevStats = "https://api.prod.flash.trade/protocol-fees/daily";
const urlFeeesStats = "https://api.prod.flash.trade/market-stat/revenue-24hr";

const calculateProtocolRevenue = (stats: Pool[]) => {
    return stats
        .filter(item => item.poolName !== "Community.1")
        .reduce((sum, item) => sum + 0.3 * Number(item.totalRevenue) / 1e6, 0);
}

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
    const timestamp = options.startOfDay;

    const dailyRevStatsResponse = await fetchURL(urlRevStats);
    const dailtyFeesStatsResponse = await fetchURL(urlFeeesStats);
    const dailyStats: Pool[] = dailyRevStatsResponse;
    const dailyFeesStats: Fees[] = dailtyFeesStatsResponse;

    const targetDate = new Date(timestamp * 1000).toISOString().split('T')[0];

    const todayStats = dailyStats.filter(item => {
        const itemDate = new Date(item.date).toISOString().split('T')[0];
        return itemDate === targetDate;
    });

    const dailyFees = dailyFeesStats.reduce((sum, item) => sum + parseFloat(item.accured), 0);

    // Token stakers revenue is 0 before 2025-06-15
    const dailyRevenue = calculateProtocolRevenue(todayStats);
    const dailyProtocolRevenue = timestamp >= 1749945600 ? dailyRevenue * 0.5 : dailyRevenue;
    const dailyHoldersRevenue = timestamp >= 1749945600 ? dailyRevenue * 0.5 : 0;
    const dailySupplySideRevenue = dailyFees - dailyRevenue;

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    };
};

const methodology = {
    Fees: 'Sum of all fees from the LP pools.',
    Revenue: 'Sum of protocol revenue and holder revenue.',
    ProtocolRevenue: '30% of all the fees accrued excluding Community pool before 2025-06-15, 15% after 2025-06-15.',
    HolderRevenue: '50% of revenue goes to token stakers after 2025-06-15.',
    SupplySideRevenue: 'Fees paid to LP pools.',
}

const adapter: Adapter = {
    version: 2,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            runAtCurrTime: true,
            start: '2024-03-12',
            meta: { methodology },
        },
    },
};

export default adapter;