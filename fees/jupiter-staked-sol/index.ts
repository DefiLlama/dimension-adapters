import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "../jupiter";
import { assertJupiterStatsPublished, getJupiterStatsRevenue, JUPITER_STATS_API_START_TS } from "../../helpers/jupiter-stats";

const STAKE_POOL_RESERVE_ACCOUNT = "FMAWbzuxsgbgndArunedwxXPA6sweaVUGGgadCpSxau2";
const STAKE_POOL_WITHDRAW_AUTHORITY = "EMjuABxELpYWYEwjkKmQKBNCwdaFAy4QYAs6W9bDQDNw";
const LST_FEE_TOKEN_ACCOUNT_OLD = "DG399HKiLgKxGG176QiojyTtiSeqAurK6FVXGfBPTzSD"; // old
const LST_FEE_TOKEN_ACCOUNT_NEW = "GbvFCpMqKX65gQ8KNeob9JUAL7vHCHFSg8YN5bnpPT8g";
const LST_MINT = ADDRESSES.solana.JupSOL;
const STAKE_FEE_SHARE = 0.05;

const queryPool = async (options: FetchOptions) => {
  const LST_FEE_TOKEN_ACCOUNT = options.startOfDay <= 1760486400 ? LST_FEE_TOKEN_ACCOUNT_OLD : LST_FEE_TOKEN_ACCOUNT_NEW;
  const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT,
    stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY,
    lst_fee_token_account: LST_FEE_TOKEN_ACCOUNT,
    lst_mint: LST_MINT,
    exclude_mints_filter: "AND action!='mint'"
  });

  return queryDuneSql(options, query);
};

const fetchOnchain = async (options: FetchOptions) => {
  const results = await queryPool(options);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  results.forEach((row: any) => {
    if (row.metric_type === 'dailyFees') {
      dailyFees.addCGToken("solana", row.amount || 0, JUPITER_METRICS.JupSOLStakingRewards);
      dailyRevenue.addCGToken("solana", (row.amount || 0) * STAKE_FEE_SHARE, JUPITER_METRICS.JupSOLStakingRewards);
      dailySupplySideRevenue.addCGToken("solana", (row.amount || 0) * (1 - STAKE_FEE_SHARE), JUPITER_METRICS.JupSOLStakingRewardsToStakers);
    } else if (row.metric_type === 'dailyRevenue') {
      dailyFees.addCGToken("jupiter-staked-sol", row.amount || 0, JUPITER_METRICS.JupSOLDepositWithdrawFees);
      dailyRevenue.addCGToken("jupiter-staked-sol", row.amount || 0, JUPITER_METRICS.JupSOLDepositWithdrawFees);
    }
  });
  
  const buybackRatio = jupBuybackRatioFromRevenue(options.startOfDay);
  const revenueHolders = dailyRevenue.clone(buybackRatio);
  const revenueProtocol = dailyRevenue.clone(1 - buybackRatio);
  dailyProtocolRevenue.add(revenueProtocol, JUPITER_METRICS.JupSOLDepositWithdrawFees);
  dailyHoldersRevenue.add(revenueHolders, JUPITER_METRICS.TokenBuyBack);
  
  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  };
};

// From 2026-01-01: 95% of the pool's inflation rewards from the query above, and from Jupiter's stats API the 5% pool
// fee, validator commission on the pool's stake, MEV and priority fees, and the withdrawal fee.
const fetchStatsApi = async (options: FetchOptions) => {
  await assertJupiterStatsPublished(options);
  const [results, api] = await Promise.all([
    queryPool(options),
    getJupiterStatsRevenue(options, {
      jupsol: {
        fees: JUPITER_METRICS.JupSOLPoolFees,
        revenue: JUPITER_METRICS.JupSOLPoolFeesToJupiter,
        supplySide: JUPITER_METRICS.JupSOLPoolFeesToOthers,
      },
    }),
  ]);
  const inflationSol = results
    .filter((row: any) => row.metric_type === 'dailyFees')
    .reduce((sum: number, row: any) => sum + (row.amount || 0), 0);

  const dailyFees = api.dailyFees;
  const dailySupplySideRevenue = api.dailySupplySideRevenue;
  dailyFees.addCGToken("solana", inflationSol * (1 - STAKE_FEE_SHARE), JUPITER_METRICS.JupSOLStakingRewards);
  dailySupplySideRevenue.addCGToken("solana", inflationSol * (1 - STAKE_FEE_SHARE), JUPITER_METRICS.JupSOLStakingRewardsToStakers);

  return {
    dailyFees,
    dailyRevenue: api.dailyRevenue,
    dailyProtocolRevenue: api.dailyRevenue.clone(1),
    dailySupplySideRevenue,
  };
};

const fetch = async (options: FetchOptions) =>
  options.startOfDay >= JUPITER_STATS_API_START_TS ? fetchStatsApi(options) : fetchOnchain(options);

const methodology = {
  Fees: 'Staking rewards from staked SOL and deposit/withdraw fees on jupiter staked solana. From 2026-01-01, staking rewards to holders, and the pool fee, validator commission, MEV, priority fees and withdrawal fee from Jupiter\'s stats API.',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector. From 2026-01-01, Jupiter\'s part of the pool fee and validator commission, from Jupiter\'s stats API.',
  ProtocolRevenue: 'All revenue goes to the Jupiter treasury.',
  HoldersRevenue: 'JUP buybacks are reported once, on the Jupiter Aggregator listing, from the JUP the Litterbox buys.',
  SupplySideRevenue: 'All SOL staking rewards go to stakers. From 2026-01-01, also MEV and priority fees passed to holders, and the parts of the pool fee, commission and withdrawal fee not kept by Jupiter.'
}

const adapter: SimpleAdapter = {
  version: 1,
  methodology,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2024-06-09",
  isExpensiveAdapter: true,
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.JupSOLStakingRewards]: 'Staking rewards from staked SOL on Jupiter.',
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: 'Includes 0.1% deposit fee.',
      [JUPITER_METRICS.JupSOLPoolFees]: 'From 2026-01-01, the pool fee, validator commission on the pool\'s stake, MEV, priority fees and the withdrawal fee.',
    },
    Revenue: {
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: 'Includes 0.1% deposit fee.',
      [JUPITER_METRICS.JupSOLStakingRewards]: '5% of staking rewards are collected as fees.',
      [JUPITER_METRICS.JupSOLPoolFeesToJupiter]: 'From 2026-01-01, Jupiter\'s part of the pool fee and validator commission.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: 'Deposit and withdraw fees, all to the Jupiter treasury.',
      [JUPITER_METRICS.JupSOLPoolFeesToJupiter]: 'From 2026-01-01, Jupiter\'s part of the pool fee and validator commission, all to the Jupiter treasury.',
      [JUPITER_METRICS.JupSOLStakingRewards]: '5% of staking rewards are collected as fees.',
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.JupSOLStakingRewardsToStakers]: '95% of the staking rewards are distributed to jupSOL.',
      [JUPITER_METRICS.JupSOLPoolFeesToOthers]: 'From 2026-01-01, MEV and priority fees passed to holders, the withdrawal fee, and the parts of the pool fee and commission not kept by Jupiter.',
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: 'JUP buybacks are reported once, on the Jupiter Aggregator listing, from the JUP the Litterbox buys.',
    },
  } ,
};

export default adapter;