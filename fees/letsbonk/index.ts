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

import { CHAIN } from '../../helpers/chains'
import { Dependencies, FetchOptions, SimpleAdapter } from '../../adapters/types'
import { getSolanaReceived } from '../../helpers/token'

const PERCENTAGE_CHANGE_TIMESTAMP = 1749513600;

const PLATFORM_FEE_WALLET = '56XVRVAsgWv6ADaxzoNnbL38LMoWKM5WiSAhrAWUbd2p';
const CREATOR_FEE_WALLET = '9sHpTfmVpCfP2zexRNK6j38NBchMv1RWpdXPK5NEcZan';

const fetch = async (timestamp: any, _b: any, options: FetchOptions) => {
    const platformFees = options.createBalances()
    const creatorFees = options.createBalances()

    await getSolanaReceived({ options, balances: platformFees, target: PLATFORM_FEE_WALLET })
    await getSolanaReceived({ options, balances: creatorFees, target: CREATOR_FEE_WALLET })

    // Determine Letsbonk's share based on timestamp
    let letsbonkHoldersRevenuePercentage: number;
    let letsbonkProtocolRevenuePercentage: number;
    let letsbonkTotalPercentage: number;

    if (timestamp >= PERCENTAGE_CHANGE_TIMESTAMP) {
        // After percentage change: Letsbonk gets Buy/Burn 50% + SBR 4% + BonkRewards 4% + Marketing 2% = 60%
        letsbonkHoldersRevenuePercentage = 0.58;
        letsbonkProtocolRevenuePercentage = 0.02;
        letsbonkTotalPercentage = 0.60;
    } else {
        // Before percentage change: Letsbonk gets Buy/Burn 35% + SBR 4% + BonkRewards 4% + Marketing 2% = 45%
        letsbonkHoldersRevenuePercentage = 0.43;
        letsbonkProtocolRevenuePercentage = 0.02;
        letsbonkTotalPercentage = 0.45;
    }

    const dailyFees = options.createBalances()
    const dailySupplySideRevenue = creatorFees

    dailyFees.addBalances(platformFees)
    dailyFees.addBalances(creatorFees)

    const dailyRevenue = platformFees.clone(letsbonkTotalPercentage)
    const dailyProtocolRevenue = platformFees.clone(letsbonkProtocolRevenuePercentage)
    const dailyHoldersRevenue = platformFees.clone(letsbonkHoldersRevenuePercentage)

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    };
};

const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    start: '2025-04-27',
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.ALLIUM],
    methodology: {
        Fees: "Fees are collected from users and distributed to holders and protocol.",
        Revenue: "Total Letsbonk Protocol Revenue and Holders Revenue",
        SupplySideRevenue: "Fees for coin creators.",
        ProtocolRevenue: "2% of total fees for marketing.",
        HoldersRevenue: "Before 10th jun 2025: 43% of total fees (Buy/burn 35% + SBR 4% + BonkRewards 4%). After 10th jun 2025: 58% of total fees (Buy/burn 50% + SBR 4% + BonkRewards 4%)."
    },
};

export default adapter;