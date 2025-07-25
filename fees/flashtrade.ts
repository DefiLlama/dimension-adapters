import { Adapter, FetchOptions, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import ADDRESSES from "../helpers/coreAssets.json";

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
// const urlFeeesStats = "https://api.prod.flash.trade/market-stat/revenue-24hr";

const calculateProtocolRevenue = (stats: Pool[]) => {
    return stats
        .filter(item => item.poolName !== "Community.1")
        .reduce((sum, item) => sum + 0.3 * Number(item.totalRevenue) / 1e6, 0);
}

const pools = [
    "Crypto.1",
    "Virtual.1",
    "Governance.1",
    "Community.1",
    "Community.2",
    "Community.3",
    "Trump.1",
]

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
    const timestamp = options.startOfDay;
    console.log(timestamp);
    const targetDate = new Date(timestamp * 1000).toISOString().split('T')[0];
    console.log(targetDate);

    let dailyFees = 0;
    for (const pool of pools) {
        const url = `https://api.prod.flash.trade/pnl-info/cumulative-pnl-per-day?poolName=${pool}&startDate=2023-01-01%2000:00:00&endDate=${targetDate}%2023:59:59`;
        const res = await fetchURL(url);
        dailyFees += (res[targetDate]?.totalFees / 1e6) || 0;
    }

    const dailyRevStatsResponse = await fetchURL(urlRevStats);
    const dailyStats: Pool[] = dailyRevStatsResponse;

    const todayStats = dailyStats.filter(item => {
        const itemDate = new Date(item.date).toISOString().split('T')[0];
        return itemDate === targetDate;
    });

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
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2023-12-29',
            meta: { methodology },
        },
    },
};

export default adapter;