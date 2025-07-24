import ADDRESSES from '../../helpers/coreAssets.json'
/*
METHODOLOGY:
Graphite Protocol is part of a joint venture with LetsBONK.fun on Solana.

Revenue is distributed as follows (Source: https://revenue.letsbonk.fun/):

Before 1749513600:
Holders Revenue (43% of total Letsbonk share, 7.6% of total Graphite share):
- Buy/Burn (35% of total): BONK tokens are purchased and burned - Letsbonk: 35%
- SBR (4% of total): Ecosystem growth initiatives - Letsbonk: 4%
- BonkRewards (4% of total): User rewards and incentives - Letsbonk: 4%
- GP Reserve (7.6% of total): Protocol treasury - Graphite: 7.6%

Protocol Revenue (56.8% of total, split between Letsbonk and Graphite):
- BONKsol Staking (30% of total): Protocol-owned BONKsol purchases retaining SOL in ecosystem - Graphite: 30%
- Hiring/Growth (7.6% of total): Team expansion - Graphite: 7.6%
- Development/Integration (7.6% of total): Technical development - Graphite: 7.6%
- Marketing (4% of total): Platform promotion - Graphite: 4%

After 1749513600:
Holders Revenue (58% of total Letsbonk share, 7.6% of total Graphite share):
- Buy/Burn (50% of total): BONK tokens are purchased and burned - Letsbonk: 50%
- SBR (4% of total): Ecosystem growth initiatives - Letsbonk: 4%
- BonkRewards (4% of total): User rewards and incentives - Letsbonk: 4%
- GP Reserve (7.6% of total): Protocol treasury - Graphite: 7.6%

Protocol Revenue (42% of total, split between Letsbonk and Graphite):
- BONKsol Staking (15% of total): Protocol-owned BONKsol purchases retaining SOL in ecosystem - Graphite: 15%
- Hiring/Growth (7.6% of total): Team expansion - Graphite: 7.6%
- Development/Integration (7.6% of total): Technical development - Graphite: 7.6%
- Marketing (4% of total): Platform promotion - Graphite: 4%

*/

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";

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
    
    // Determine which percentage structure to use based on timestamp
    let holdersRevenuePercentage: number;
    let protocolRevenuePercentage: number;
    
    if (timestamp >= PERCENTAGE_CHANGE_TIMESTAMP) {
        // After percentage change: Buy/Burn 50% + SBR 4% + BonkRewards 4% = 58%
        holdersRevenuePercentage = 0.58;
        // BONKsol Staking 15% + GP Reserve 7.6% + Hiring/Growth 7.6% + Development/Integration 7.6% + Marketing 4% = 42%
        protocolRevenuePercentage = 0.42;
    } else {
        // Before percentage change: Buy/Burn 35% + SBR 4% + BonkRewards 4% = 43%
        holdersRevenuePercentage = 0.43;
        // BONKsol Staking 30% + GP Reserve 7.6% + Hiring/Growth 7.6% + Development/Integration 7.6% + Marketing 4% = 56.8%
        protocolRevenuePercentage = 0.568;
    }
    
    const holdersRevenueLamports = totalFeesLamports * holdersRevenuePercentage;
    const protocolRevenueLamports = totalFeesLamports * protocolRevenuePercentage;

    dailyFees.add(SOL_ADDRESS, totalFeesLamports);
    dailyHoldersRevenue.add(SOL_ADDRESS, holdersRevenueLamports);
    dailyProtocolRevenue.add(SOL_ADDRESS, protocolRevenueLamports);

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
            meta: {
                methodology: {
                    Fees: "Fees are collected from users and distributed to holders and protocol.",
                    ProtocolRevenue: "Before 10th jun 2025: 56.8% of fees are distributed to the protocol. After 10th jun 2025: 42% of fees are distributed to the protocol.",
                    HoldersRevenue: "Before 10th jun 2025: 43% of fees are distributed to holders. After 10th jun 2025: 58% of fees are distributed to holders."
                },
                hallmarks: [
                    [1749513600, 'BuyBack and burn increased from 35% to 50% of revenue'], // https://x.com/bonk_fun/status/1932242245970747708
                ],
            }
        }
    }
};

export default adapter;