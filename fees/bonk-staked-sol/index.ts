import { Dependencies, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";

const STAKE_POOL_RESERVE_ACCOUNT = "5htyN73FSd1dvv8LEHrmy4EiDkXtrGn5EXv5ZizqVF3X";
const STAKE_POOL_WITHDRAW_AUTHORITY = "9LcmMfufi8YUcx83RALwF9Y9BPWZ7SqGy4D9VLe2nhhA";
const LST_FEE_TOKEN_ACCOUNT = "2azKdTLTd7xBF3mKjVBrrpj5jgJHoCRXLNpFjhfgzXwv";
const LST_MINT = 'BonK1YhkXEGLZzwtcvRTip3gAL9nCeQD7ppZBLXhtTs';

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
  const dailySupplySideRevenue = options.createBalances()

  results.forEach((row: any) => {
    if (row.metric_type === 'dailyFees') {
        const amount = Number(row.amount) || 0
        dailyFees.addCGToken("solana", amount, "BonkSOL Staking Rewards");
        dailySupplySideRevenue.addCGToken("solana", amount * 0.95, "BonkSOL Staking Rewards to Stakers")
        dailySupplySideRevenue.addCGToken("solana", amount * 0.025, "BonkSOL Staking Rewards to Sanctum")
        dailyRevenue.addCGToken("solana", amount * 0.025, "BonkSOL Staking Rewards to Bonk")
    } else if (row.metric_type === 'dailyRevenue') {
        const amount = Number(row.amount) || 0
        dailyFees.addCGToken("bonk-staked-sol", amount, "BonkSOL Withdrawal Fees")
        dailyRevenue.addCGToken("bonk-staked-sol", amount, "BonkSOL Withdrawal Fees");
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue: dailyRevenue
  };
};

const methodology = {
  Fees: 'Staking rewards from staked SOL on Bonk staked solana and withdrawal fees',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  SupplySideRevenue: 'Includes 95% of the staking rewards that go to bonkSOL and 2.5% to Sanctum',
  ProtocolRevenue: 'Revenue going to treasury/team',
}

export default {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: "2024-07-17",
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology,
    breakdownMethodology: {
      Fees: {
        "BonkSOL Staking Rewards": "Staking rewards from staked SOL on Bonk.",
        "BonkSOL Withdrawal Fees": "Includes 0.1% withdrawal fee.",
      },
      Revenue: {
        "BonkSOL Staking Rewards to Bonk": "2.5% of the staking rewards go to Bonk.",
        "BonkSOL Withdrawal Fees": "All the withdrawal fees are revenue"
      },
      ProtocolRevenue: {
        "BonkSOL Staking Rewards to Bonk": "2.5% of the staking rewards go to Bonk.",
        "BonkSOL Withdrawal Fees": "All the withdrawal fees are revenue"
      },
      SupplySideRevenue: {
        "BonkSOL Staking Rewards to Stakers": "95% of the staking rewards are distributed to bonkSOL.",
        "BonkSOL Staking Rewards to Sanctum": "2.5% of the staking rewards go to Sanctum"
      },
    },
};