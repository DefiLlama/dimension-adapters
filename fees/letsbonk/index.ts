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
import fetchURL from '../../utils/fetchURL';
import { getTimestampAtStartOfDayUTC } from '../../utils/date'

const PERCENTAGE_CHANGE_TIMESTAMP = 1749513600;

const PLATFORM_FEE_WALLET = '56XVRVAsgWv6ADaxzoNnbL38LMoWKM5WiSAhrAWUbd2p';
const CREATOR_FEE_WALLET = '9sHpTfmVpCfP2zexRNK6j38NBchMv1RWpdXPK5NEcZan';

const getLetsbonkPercentages = (timestamp: number) => {
    if (timestamp >= PERCENTAGE_CHANGE_TIMESTAMP) {
        return { holdersRevenuePercentage: 0.58, protocolRevenuePercentage: 0.02, totalPercentage: 0.60 };
    }
        return { holdersRevenuePercentage: 0.43, protocolRevenuePercentage: 0.02, totalPercentage: 0.45 };
};

const fetchFromApi = async (timestamp: any, _b: any, options: FetchOptions) => {
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
    const { holdersRevenuePercentage, protocolRevenuePercentage, totalPercentage } = getLetsbonkPercentages(timestamp);
    const dailyRevenueSol = currentEntry.solRevenue - (prevEntry?.solRevenue || 0);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    dailyFees.addCGToken("solana", dailyRevenueSol, "BonkFun Trading Fees");
    dailyRevenue.addCGToken("solana", dailyRevenueSol * totalPercentage, "BonkFun Trading Fees");
    dailyHoldersRevenue.addCGToken("solana", dailyRevenueSol * holdersRevenuePercentage, "BonkFun Trading Fees");
    dailyProtocolRevenue.addCGToken("solana", dailyRevenueSol * protocolRevenuePercentage, "BonkFun Trading Fees");
    dailySupplySideRevenue.addCGToken("solana", dailyRevenueSol * (1 - totalPercentage), "Graphite's share of BonkFun fees");

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    };
}

const fetchAllium = async (timestamp: any, _b: any, options: FetchOptions) => {
    const platformFees = options.createBalances()
    const creatorFees = options.createBalances()

    await getSolanaReceived({ options, balances: platformFees, target: PLATFORM_FEE_WALLET })
    await getSolanaReceived({ options, balances: creatorFees, target: CREATOR_FEE_WALLET })

    const { holdersRevenuePercentage, protocolRevenuePercentage, totalPercentage } = getLetsbonkPercentages(timestamp);

    const dailyFees = options.createBalances()
    const dailySupplySideRevenue = creatorFees.clone(1, "BonkFun Creator Fees")

    dailyFees.addBalances(platformFees, "BonkFun Trading Fees")
    dailyFees.addBalances(creatorFees, "BonkFun Creator Fees")

    const graphitePortion = platformFees.clone(1 - totalPercentage)
    dailySupplySideRevenue.addBalances(graphitePortion, "Graphite's share of BonkFun fees")

    const dailyRevenue = platformFees.clone(totalPercentage, "BonkFun Trading Fees")
    const dailyProtocolRevenue = platformFees.clone(protocolRevenuePercentage, "BonkFun Trading Fees")
    const dailyHoldersRevenue = platformFees.clone(holdersRevenuePercentage, "BonkFun Trading Fees")

    return {
        dailyFees,
        dailyUserFees: dailyFees,
        dailyRevenue,
        dailyProtocolRevenue,
        dailyHoldersRevenue,
        dailySupplySideRevenue,
    };
};

const fetch = async (timestamp: any, _b: any, options: FetchOptions) => {
    return timestamp >= PERCENTAGE_CHANGE_TIMESTAMP ? fetchAllium(timestamp, _b, options) : fetchFromApi(timestamp, _b, options)
}


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
    breakdownMethodology: {
        Fees: {
            "BonkFun Trading Fees": "Platform trading fees collected by LetsBONK.",
            "BonkFun Creator Fees": "Fees paid to coin creators.",
        },
        Revenue: {
            "BonkFun Trading Fees": "The portion of trading fees kept by LetsBONK.",
        },
        ProtocolRevenue: {
            "BonkFun Trading Fees": "The portion of trading fees kept by LetsBONK.",
        },
        SupplySideRevenue: {
            "BonkFun Creator Fees": "Fees paid to coin creators.",
            "Graphite's share of BonkFun fees": "Graphite Protocol's share of platform fees (BONKsol staking, hiring/growth, development, GP reserve, and partial marketing)."
        },
        HoldersRevenue: {
            "BonkFun Trading Fees": "Before 10th jun 2025: 43% of total fees (Buy/burn 35% + SBR 4% + BonkRewards 4%). After 10th jun 2025: 58% of total fees (Buy/burn 50% + SBR 4% + BonkRewards 4%).",
        }
    },
};

export default adapter;