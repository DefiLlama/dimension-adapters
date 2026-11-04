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
const STAKE_FEE_SHARE = 0.05;
// The 5% epoch fee is split equally, 2.5% Sanctum (infrastructure provider) / 2.5% Jupiter DAO
// (https://docs.jup.ag/user-docs/earn/stake-sol/jupsol). Sanctum's half is supply side, as in bonk-staked-sol.
// On-chain the fee account's sweeps send half of the minted fee to one recipient, e.g. 17.215172 of 34.4316 JupSOL in
// 3y473xJxpuGeeMCNXTiyxZHzpgGcefTq2NnfmuGQPRfsB77HyNnpM4E5uiAzQ3P6p5Kr9Y7evWWNWht9Dboh2QuN.
const SANCTUM_FEE_SHARE = 0.025;
// Identity of the Jupiter validator (vote account CatzoSMUkTRidT5DwBxAC2pEtnwMBTpkCepHkFgZDiqb). It passes JupSOL's share of
// the validator's priority fees to the pool reserve ("JupSOL's share of priority fees goes to the pool", same docs page) with one
// plain transfer per epoch that mints no JupSOL, e.g. 3AxJjFRrJdmXoarUNL3FKhDRhEF9ZLQ3qkECeH4owJuMAMPuMeZ5TGikPc9fjQvHuN9Bk8q4CXd8b2YUyrXLL3on.
// Only Jupiter's validator identities are counted: JUPiTERrZ... produces the blocks and sends these transfers today, and as of
// 2026-11-04 the vote account already reports JUPiTERkf97... as its identity, so transfers from either are counted.
const JUPITER_VALIDATOR_IDENTITIES = ["JUPiTERrZqgf1jUyR7dSkhMx4Kn2qJyekWsg3LT1h4b", "JUPiTERkf97eKN222JwY7bkpWuJnwqKtT44fsbJfhkr"];

const fetch = async (options: FetchOptions) => {
  const LST_FEE_TOKEN_ACCOUNT = options.startOfDay <= 1760486400 ? LST_FEE_TOKEN_ACCOUNT_OLD : LST_FEE_TOKEN_ACCOUNT_NEW;
  const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT,
    stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY,
    lst_fee_token_account: LST_FEE_TOKEN_ACCOUNT,
    lst_mint: LST_MINT,
    exclude_mints_filter: "AND action!='mint'"
  }) + `
UNION ALL
SELECT
    'dailyValidatorPriorityFees' as metric_type,
    COALESCE(SUM(lamports), 0)/1e9 as amount
FROM
    system_program_solana.system_program_call_transfer
WHERE
    account_from IN (${JUPITER_VALIDATOR_IDENTITIES.map((a) => `'${a}'`).join(', ')})
    AND account_to='${STAKE_POOL_RESERVE_ACCOUNT}'
    AND call_block_time>=from_unixtime(${options.startTimestamp})
    AND call_block_time<from_unixtime(${options.endTimestamp})
`;

  const results = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();

  // Inflation rewards, Jito MEV tips and the validator's priority fees all raise SOL per JupSOL, and the pool's epoch-fee mint
  // is 5% of all three on-chain, so each is split 95% stakers / 2.5% Sanctum / 2.5% Jupiter DAO.
  const rewardLabels: Record<string, string> = {
    dailyFees: JUPITER_METRICS.JupSOLStakingRewards,
    dailyMevRewards: JUPITER_METRICS.JupSOLMevRewards,
    dailyValidatorPriorityFees: JUPITER_METRICS.JupSOLValidatorPriorityFees,
  };

  results.forEach((row: any) => {
    const rewardLabel = rewardLabels[row.metric_type];
    if (rewardLabel) {
      const amount = Number(row.amount) || 0;
      dailyFees.addCGToken("solana", amount, rewardLabel);
      dailyRevenue.addCGToken("solana", amount * (STAKE_FEE_SHARE - SANCTUM_FEE_SHARE), rewardLabel);
      dailySupplySideRevenue.addCGToken("solana", amount * (1 - STAKE_FEE_SHARE), JUPITER_METRICS.JupSOLStakingRewardsToStakers);
      dailySupplySideRevenue.addCGToken("solana", amount * SANCTUM_FEE_SHARE, JUPITER_METRICS.JupSOLStakingRewardsToSanctum);
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
  Fees: "Staking rewards from staked SOL (inflation, Jito MEV tips and the Jupiter validator's priority fees passed to the pool) and deposit/withdraw fees on jupiter staked solana",
  Revenue: "Withdrawal fees, plus Jupiter DAO's 2.5% of staking rewards (half of the 5% epoch fee, the other half goes to Sanctum)",
  ProtocolRevenue: '50% revenue going to treasury/team, it was 100% before 2025-02-17.',
  HoldersRevenue: 'From 2025-02-17, 50% revenue are used to buy back JUP tokens.',
  SupplySideRevenue: '95% of staking rewards go to JupSOL holders and 2.5% to Sanctum, which provides the stake pool program.'
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
      [JUPITER_METRICS.JupSOLMevRewards]: "Jito MEV tips claimed by the pool's stake accounts.",
      [JUPITER_METRICS.JupSOLValidatorPriorityFees]: "The Jupiter validator's priority fees on JupSOL's stake, sent to the pool reserve.",
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: 'Includes 0.1% deposit fee.',
    },
    Revenue: {
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: 'Includes 0.1% deposit fee.',
      [JUPITER_METRICS.JupSOLStakingRewards]: "Jupiter DAO's 2.5% of staking rewards (half of the 5% epoch fee).",
      [JUPITER_METRICS.JupSOLMevRewards]: "Jupiter DAO's 2.5% of the MEV tips (half of the 5% epoch fee).",
      [JUPITER_METRICS.JupSOLValidatorPriorityFees]: "Jupiter DAO's 2.5% of the priority fees (half of the 5% epoch fee).",
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: '50% revenue going to treasury/team, it was 100% before 2025-02-17.',
      [JUPITER_METRICS.JupSOLStakingRewards]: "Jupiter DAO's 2.5% of staking rewards (half of the 5% epoch fee).",
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.JupSOLStakingRewardsToStakers]: '95% of the staking rewards, MEV tips and priority fees are distributed to jupSOL.',
      [JUPITER_METRICS.JupSOLStakingRewardsToSanctum]: "Sanctum's 2.5% of the staking rewards, MEV tips and priority fees (half of the 5% epoch fee).",
    },
    HoldersRevenue: {
      [JUPITER_METRICS.TokenBuyBack]: 'From 2025-02-17, 50% revenue are used to buy back JUP tokens.',
    },
  } ,
};

export default adapter;