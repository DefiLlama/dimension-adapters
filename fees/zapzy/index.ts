import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains'
import { getTimestampAtStartOfDayUTC } from '../../utils/date'
import fetchURL from '../../utils/fetchURL'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'

const SOL_ADDRESS = ADDRESSES.solana.SOL;

const fetch = async (timestamp: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    const data = await fetchURL("https://frontend-api-v1.zapzy.io/api/stats/fees");
    const targetDate = new Date(getTimestampAtStartOfDayUTC(timestamp) * 1000);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    const prevDate = new Date(getTimestampAtStartOfDayUTC(timestamp - 86400) * 1000);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    const currentEntry = data.fees.find((entry: any) => entry.timestamp.split('T')[0] === targetDateStr);
    const prevEntry = data.fees.find((entry: any) => entry.timestamp.split('T')[0] === prevDateStr);
    if (!currentEntry) {
        throw new Error('No data found for the current date');
    }
    if (!prevEntry) {
        throw new Error('No data found for the previous date');
    }

    const dailyRevenueSol = currentEntry.solFees - (prevEntry?.solFees || 0);
    const totalFeesLamports = dailyRevenueSol * 1e9;

    // Zapzy revenue: 90% effective revenue (10% to creators, 90% to protocol)
    const protocolRevenuePercentage = 0.90;
    const protocolRevenue = totalFeesLamports * protocolRevenuePercentage;

    dailyFees.add(SOL_ADDRESS, totalFeesLamports);
    dailyRevenue.add(SOL_ADDRESS, protocolRevenue);

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue
    };
};

const adapter: SimpleAdapter = {
    methodology: {
        Fees: "Fees are collected from users and distributed to coin creators, referral users, and the protocol.",
        Revenue: "10% goes to coin creators, 30% goes to referral users when using a referral code, 60%/90% of total fees go to the Zapzy protocol.",
    },
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-08-27',
        }
    }
};

export default adapter;