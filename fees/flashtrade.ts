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

interface Fees {
    pool: string;
    accured: string;
    paid: string;
    protocolFee: string;
    feesPaidToLP: string;
}

const urlRevStats = "https://api.prod.flash.trade/protocol-fees/daily"; // FAF revenue and protocol revenue divided based on revc share %
const urlFeeesStats = "https://api.prod.flash.trade/market-stat/revenue-24hr"; // accured fees

const calculateProtocolRevenue = (stats: Pool[]) => {
    const protocolRevenue = stats.reduce((sum, item) => sum + parseFloat(item.totalProtocolFee), 0);
    return protocolRevenue;
};

const calculateteHolderRevenue = (stats: Pool[]) => {
    const holderRevenue = stats.reduce((sum, item) => sum + parseFloat(item.totalRevenue), 0);
    return holderRevenue;
};

const fetchFlashStats = async (options: FetchOptions): Promise<FetchResultFees> => {
    const timestamp = options.startOfDay;
    
    const dailyRevStatsResponse = await fetchURL(urlRevStats);
    const dailtyFeesStatsResponse = await fetchURL(urlFeeesStats);
    const dailyStats: Pool[] = dailyRevStatsResponse;
    const dailyFeesStats: Fees[] = dailtyFeesStatsResponse;
    
    // Convert timestamp to date string format matching the API data
    const targetDate = new Date(timestamp * 1000).toISOString().split('T')[0];
    
    // Filter to only include entries from the target date
    const todayStats = dailyStats.filter(item => {
        const itemDate = new Date(item.date).toISOString().split('T')[0];
        return itemDate === targetDate;
    });
    
    // const dailyAccrued = (todayStats.reduce((sum, item) => sum + parseFloat(item.totalProtocolFee), 0));
    const dailyFees = dailyFeesStats.reduce((sum, item) => sum + parseFloat(item.accured), 0);

    const dailyProtocolRevenue = calculateProtocolRevenue(todayStats);

    const dailyHolderRevenue = calculateteHolderRevenue(todayStats);

    return {
        dailyFees: (dailyFees).toString(), // should be accured -> given out to LPs
        dailyProtocolRevenue: (dailyProtocolRevenue * 10**-6).toString(), 
        dailyHoldersRevenue: (dailyHolderRevenue * 10**-6).toString(), 
    };
};

const methodology = {
    Fees: 'Sum of all fees paid to LPs from the LP pools.',
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