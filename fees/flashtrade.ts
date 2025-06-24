import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';

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

const fetch = async (options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();

    const dailyStats: Pool[] = await fetchURL(urlDailyStats);
    const dailyAccrued = dailyStats.reduce((sum, item) => sum + parseFloat(item.totalProtocolFee), 0);
    const protocol_revenue = calculateProtocolRevenue(dailyStats);

    dailyFees.add(USDC_MINT, dailyAccrued);
    dailyRevenue.add(USDC_MINT, protocol_revenue * 2);
    dailyProtocolRevenue.add(USDC_MINT, protocol_revenue);

    return {
        dailyFees,
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
            fetch,
            runAtCurrTime: true,
            meta: { methodology },
        },
    },
};

export default adapter;