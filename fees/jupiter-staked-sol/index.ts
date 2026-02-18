import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";
import { JUPITER_METRICS, jupBuybackRatioFromRevenue } from "../jupiter";

const STAKE_POOL_RESERVE_ACCOUNT = "FMAWbzuxsgbgndArunedwxXPA6sweaVUGGgadCpSxau2";
const STAKE_POOL_WITHDRAW_AUTHORITY = "EMjuABxELpYWYEwjkKmQKBNCwdaFAy4QYAs6W9bDQDNw";
const LST_FEE_TOKEN_ACCOUNT_OLD = "DG399HKiLgKxGG176QiojyTtiSeqAurK6FVXGfBPTzSD"; // old
const LST_FEE_TOKEN_ACCOUNT_NEW = "GbvFCpMqKX65gQ8KNeob9JUAL7vHCHFSg8YN5bnpPT8g";
const LST_MINT = ADDRESSES.solana.JupSOL;

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const LST_FEE_TOKEN_ACCOUNT = options.startOfDay <= 1760486400 ? LST_FEE_TOKEN_ACCOUNT_OLD : LST_FEE_TOKEN_ACCOUNT_NEW;
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
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  results.forEach((row: any) => {
    if (row.metric_type === 'dailyFees') {
      dailyFees.addCGToken("solana", row.amount || 0, JUPITER_METRICS.JupSOLStakingRewards);
      dailySupplySideRevenue.addCGToken("solana", row.amount || 0, JUPITER_METRICS.JupSOLStakingRewardsToStakers);
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

const methodology = {
  Fees: 'Staking rewards from staked SOL and deposit/withdraw fees on jupiter staked solana',
  Revenue: 'Includes withdrawal fees and management fees collected by fee collector',
  ProtocolRevenue: '50% revenue going to treasury/team, it was 100% before 2025-02-17.',
  HoldersRevenue: 'From 2025-02-17, 50% revenue are used to buy back JUP tokens.',
  SupplySideRevenue: 'All SOL staking rewards go to stakers.'
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
    },
    Revenue: {
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: 'Includes 0.1% deposit fee.',
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: '50% revenue going to treasury/team, it was 100% before 2025-02-17.',
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.JupSOLStakingRewardsToStakers]: 'All the staking rewards are distributed to jupSOL.',
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: 'From 2025-02-17, 50% revenue are used to buy back JUP tokens.',
    },
  } ,
};

export default adapter;