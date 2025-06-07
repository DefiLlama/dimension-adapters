/*
METHODOLOGY:
LetsBONK.fun is a decentralized platform on Solana that provides liquidity and value support for the BONK ecosystem.

Revenue is distributed as follows (Source: https://revenue.letsbonk.fun/):

Holders Revenue (43%):
- Buy/Burn (35%): BONK tokens are purchased and burned
- SBR (4%): Ecosystem growth initiatives 
- BonkRewards (4%): User rewards and incentives

Protocol Revenue (56.8%):
- BONKsol Staking (30%): Protocol-owned BONKsol purchases retaining SOL in ecosystem
- GP Reserve (7.6%): Protocol treasury
- Hiring/Growth (7.6%): Team expansion
- Development/Integration (7.6%): Technical development
- Marketing (4%): Platform promotion

*/

import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getTimestampAtStartOfDay } from "../../utils/date";
import fetchURL from "../../utils/fetchURL";

const SOL_ADDRESS = 'So11111111111111111111111111111111111111112';

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const dailyFees = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();

    const data = await fetchURL("https://revenue.letsbonk.fun/api/revenue");
    
    const targetDate = new Date(getTimestampAtStartOfDay(options.startTimestamp) * 1000);
    const targetDateStr = targetDate.toISOString().split('T')[0];
    const prevDate = new Date(getTimestampAtStartOfDay(options.startTimestamp - 86400) * 1000);
    const prevDateStr = prevDate.toISOString().split('T')[0];

    const currentEntry = data.find((entry: any) => entry.timestamp.split('T')[0] === targetDateStr);
    const prevEntry = data.find((entry: any) => entry.timestamp.split('T')[0] === prevDateStr);
    if (!currentEntry) {
        throw new Error('No data found for the current date');
    }
    if (!prevEntry && prevDateStr !== '2025-04-27') {
        throw new Error('No data found for the previous date');
    }

    const dailyRevenueSol = currentEntry.solRevenue - (prevEntry?.solRevenue || 0);
    const totalFeesLamports = dailyRevenueSol * 1e9;
    const holdersRevenueLamports = totalFeesLamports * 0.43; // 35% + 4% + 4%
    const protocolRevenueLamports = totalFeesLamports * 0.568; // 30% + 7.6% + 7.6% + 7.6% + 4%

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
                    ProtocolRevenue: "56.8% of fees are distributed to the protocol, 30% to BONKsol Staking, 7.6% to GP Reserve, 7.6% to Hiring/Growth, 7.6% to Development/Integration, and 4% to Marketing.",
                    HoldersRevenue: "43% of fees are distributed to holders, 35% to Buy/Burn, 4% to SBR, and 4% to BonkRewards."
                }
            }
        }
    }
};

export default adapter;