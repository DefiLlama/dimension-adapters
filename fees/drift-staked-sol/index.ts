// Source: https://solanacompass.com/stake-pools/9mhGNSPArRMHpLDMSmxAvuoizBqtBGqYdT8WGuqgxNdn

import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";

const STAKE_POOL_WITHDRAW_AUTHORITY = "6727ZvQ2YEz8jky1Z9fqDFG5mYuAvC9G34o2MxwzmrUK";
const STAKE_POOL_RESERVE_ACCOUNT = "4RjzgujRmdadbLjyh2L1Qn5ECsQ1qfjaapTfeWKYtsC3";
const LST_FEE_TOKEN_ACCOUNT = "5NJUMVJPVxN5huLKQ7tNxBv7LHxHDLwREUym5ekfdSgD";
const LST_MINT = ADDRESSES.solana.dSOL;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
        start: options.startTimestamp,
        end: options.endTimestamp,
        stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT,
        stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY,
        lst_fee_token_account: LST_FEE_TOKEN_ACCOUNT,
        lst_mint: LST_MINT
    });

    const results = await queryDuneSql(options, query);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    results.forEach((row: any) => {
        if (row.metric_type === 'dailyFees') {
            dailyFees.addCGToken("solana", row.amount || 0);
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

const methodology = {
    Fees: 'Staking rewards from staked SOL on drift staked solana',
    Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
    ProtocolRevenue: 'Revenue going to treasury/team',
}

export default {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    dependencies: [Dependencies.DUNE],
    start: "2024-08-26",
    methodology,
    isExpensiveAdapter: true
};