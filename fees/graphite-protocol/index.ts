/*
METHODOLOGY:
Graphite Protocol is part of a joint venture with LetsBONK.fun on Solana.

Revenue is distributed as follows (Source: https://revenue.letsbonk.fun/):

Before 1749513600:
Holders Revenue (43% of total Letsbonk share, 7.6% of total Graphite share):
- Buy/Burn (35% of total): BONK tokens are purchased and burned - Letsbonk: 35%
- SBR (4% of total): Ecosystem growth initiatives - Letsbonk: 4%
- BonkRewards (4% of total): User rewards and incentives - Letsbonk: 4%
- GP Reserve (7.67% of total): Protocol treasury - Graphite: 7.67%

Protocol Revenue (56.8% of total, split between Letsbonk and Graphite):
- BONKsol Staking (30% of total): Protocol-owned BONKsol purchases retaining SOL in ecosystem - Graphite: 30%
- Hiring/Growth (7.67% of total): Team expansion - Graphite: 7.67%
- Development/Integration (7.67% of total): Technical development - Graphite: 7.67%
- Marketing (4% of total): Platform promotion - Graphite: 4%, Bonk: 2%

After 1749513600:
Holders Revenue (58% of total Letsbonk share, 7.67% of total Graphite share):
- Buy/Burn (50% of total): BONK tokens are purchased and burned - Letsbonk: 50%
- SBR (4% of total): Ecosystem growth initiatives - Letsbonk: 4%
- BonkRewards (4% of total): User rewards and incentives - Letsbonk: 4%
- GP Reserve (7.67% of total): Protocol treasury - Graphite: 7.67%

Protocol Revenue (42% of total, split between Letsbonk and Graphite):
- BONKsol Staking (15% of total): Protocol-owned BONKsol purchases retaining SOL in ecosystem - Graphite: 15%
- Hiring/Growth (7.67% of total): Team expansion - Graphite: 7.67%
- Development/Integration (7.67% of total): Technical development - Graphite: 7.67%
- Marketing (4% of total): Platform promotion - Graphite: 2%, Bonk: 2%

*/

import ADDRESSES from '../../helpers/coreAssets.json'
import { CHAIN } from '../../helpers/chains'
import { getTimestampAtStartOfDayUTC } from '../../utils/date'
import fetchURL from '../../utils/fetchURL'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'

const SOL_ADDRESS = ADDRESSES.solana.SOL;
const PERCENTAGE_CHANGE_TIMESTAMP = 1749513600;

const fetch = async (timestamp: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const data = await fetchURL("https://revenue.letsbonk.fun/api/revenue");
    const targetDate = new Date(getTimestampAtStartOfDayUTC(timestamp) * 1000);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    const prevDate = new Date(getTimestampAtStartOfDayUTC(timestamp - 86400) * 1000);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    const currentEntry = data.find((entry: any) => entry.timestamp.split('T')[0] === targetDateStr);
    const prevEntry = data.find((entry: any) => entry.timestamp.split('T')[0] === prevDateStr);
    if (!currentEntry) {
        throw new Error('No data found for the current date');
    }
    if (!prevEntry) {
        throw new Error('No data found for the previous date');
    }

    const dailyRevenueSol = currentEntry.solRevenue - (prevEntry?.solRevenue || 0);
    const totalFeesLamports = dailyRevenueSol * 1e9;

    let graphiteHoldersRevenuePercentage: number;
    let graphiteProtocolRevenuePercentage: number;
    let graphiteTotalPercentage: number;

    if (timestamp >= PERCENTAGE_CHANGE_TIMESTAMP) {
        // After percentage change: Graphite gets GP Reserve 7.67% + BONKsol Staking 15% + Hiring/Growth 7.67% + Development/Integration 7.67% + Marketing 2% = 40%
        graphiteHoldersRevenuePercentage = 0.0767;
        graphiteProtocolRevenuePercentage = 0.3233;
        graphiteTotalPercentage = 0.40;
    } else {
        // Before percentage change: Graphite gets GP Reserve 7.67% + BONKsol Staking 30% + Hiring/Growth 7.67% + Development/Integration 7.67% + Marketing 4% = 57.68%
        graphiteHoldersRevenuePercentage = 0.0767;
        graphiteProtocolRevenuePercentage = 0.5;
        graphiteTotalPercentage = 0.5768;
    }

    const totalFees = totalFeesLamports * graphiteTotalPercentage;
    const totalHoldersRevenue = totalFeesLamports * graphiteHoldersRevenuePercentage;
    const protocolRevenue = totalFeesLamports * graphiteProtocolRevenuePercentage;

    dailyFees.add(SOL_ADDRESS, totalFees);
    dailyHoldersRevenue.add(SOL_ADDRESS, totalHoldersRevenue);
    dailyProtocolRevenue.add(SOL_ADDRESS, protocolRevenue);

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue: dailyFees,
        dailyProtocolRevenue,
        dailyHoldersRevenue
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-04-27',
        }
    },
    methodology: {
        Fees: "Graphite Protocol's portion of joint venture fees with Letsbonk. Before 10th jun 2025: 57.68% of total fees. After 10th jun 2025: 40% of total fees.",
        Revenue: "Total Graphite Protocol Revenue and Holders Revenue",
        ProtocolRevenue: "Before 10th jun 2025: 50% of total fees (BONKsol Staking 30% + Hiring/Growth 7.67% + Development/Integration 7.67% + Marketing 4%). After 10th jun 2025: 32.33% of total fees (BONKsol Staking 15% + Hiring/Growth 7.67% + Development/Integration 7.67% + Marketing 2%).",
        HoldersRevenue: "GP Reserve: 7.67% of total fees across both periods. Before 10th jun 2025: 43% of total fees."
    },
};

export default adapter;