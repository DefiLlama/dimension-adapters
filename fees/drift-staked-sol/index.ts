// Source: https://solanacompass.com/stake-pools/9mhGNSPArRMHpLDMSmxAvuoizBqtBGqYdT8WGuqgxNdn

import { FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const DRIFT_STAKE_POOL_AUTHORITY = "6727ZvQ2YEz8jky1Z9fqDFG5mYuAvC9G34o2MxwzmrUK";
const STAKE_POOL_RESERVE_ACCOUNT = "4RjzgujRmdadbLjyh2L1Qn5ECsQ1qfjaapTfeWKYtsC3";
const LST_FEE_TOKEN_ACCOUNT = "5NJUMVJPVxN5huLKQ7tNxBv7LHxHDLwREUym5ekfdSgD";
const LST_MINT = ADDRESSES.solana.DRIFTSOL;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = getSqlFromFile("helpers/queries/solana-liquid-staking-fees.sql", {
        start: options.startTimestamp,
        end: options.endTimestamp,
        stake_account: STAKE_POOL_RESERVE_ACCOUNT,
        authority: DRIFT_STAKE_POOL_AUTHORITY,
        LST_FEE_TOKEN_ACCOUNT: LST_FEE_TOKEN_ACCOUNT,
        LST_MINT: LST_MINT
    });

    const results = await queryDuneSql(options, query);
    
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    
    results.forEach((row: any) => {
        if (row.metric_type === 'dailyFees') {
            dailyFees.addCGToken("drift-staked-sol", row.amount || 0);
        } else if (row.metric_type === 'dailyRevenue') {
            dailyRevenue.addCGToken("drift-staked-sol", row.amount || 0);
        }
    });

    return {
        dailyFees,
        dailyRevenue,
        dailyProtocolRevenue: dailyRevenue
    };
};

const meta = {
    methodology: {
        Fees: 'Staking rewards from staked SOL on drift staked solana',
        Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
        ProtocolRevenue: 'Revenue going to treasury/team',
    }
}

export default {
    version: 1,
    adapter: {
        [CHAIN.SOLANA]: {
            fetch,
            start: "2024-08-26",
            meta
        }
    },
    isExpensiveAdapter: true
};