/*
METHODOLOGY:

Revenue is distributed as follows (Source: https://possumlabs.wtf/how-it-works):

Holders Revenue (43% of total PossumLabs share):
- Buy/Burn (50% of total): WTFO tokens are purchased and burned - PossumLabs: 50%

Protocol Revenue (57% of total):
- Development/Growth (26.5% of total)
- Marketing (26.5% of total): Platform promotion

*/

import { CHAIN } from '../../helpers/chains'
import { FetchOptions, SimpleAdapter } from '../../adapters/types'
import { httpGet } from '../../utils/fetchURL';

const fetch = async (timestamp: any, _b: any, options: FetchOptions) => {
    let dayValue = 0;
    try {
    const FeesData = await httpGet('https://possumlabs.wtf/api/volume?dayFees=true')
    dayValue = FeesData.dayFees;
    } catch (error) {
        console.error('Error fetching PossumLabs data:', error);    
    }

    const dailyFees = options.createBalances()
    const dailyUserFees = options.createBalances()
    const dailyRevenue = options.createBalances()
    const dailyProtocolRevenue = options.createBalances()
    const dailyHoldersRevenue = options.createBalances()
    const dailySupplySideRevenue = options.createBalances()

    const calculatedDailyFees = dayValue * (1.3 / 0.7);
    const calculatedDailyRevenue = dayValue;
    const calculatedDailyProtocolRevenue = dayValue * (0.4 / 0.7);
    const calculatedDailyHoldersRevenue = dayValue * (0.15 / 0.7);
    const calculatedDailySupplySideRevenue = calculatedDailyFees * (0.6 / 1.3);

    dailyFees.addUSDValue(calculatedDailyFees);
    dailyUserFees.addUSDValue(calculatedDailyFees);
    dailyRevenue.addUSDValue(calculatedDailyRevenue);
    dailyProtocolRevenue.addUSDValue(calculatedDailyProtocolRevenue);
    dailyHoldersRevenue.addUSDValue(calculatedDailyHoldersRevenue);
    dailySupplySideRevenue.addUSDValue(calculatedDailySupplySideRevenue);

    return {
        dailyFees,
        dailyUserFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    };

};

const adapter: SimpleAdapter = {
    methodology: {
        Fees: "Fees are collected from users and distributed to creators and protocol.",
        Revenue: "Total PossumLabs Protocol Revenue and Creators Revenue",
        HoldersRevenue: "40% of total fees for Revenue Share."
    },
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: '2025-09-02',
        }
    }
};

export default adapter;