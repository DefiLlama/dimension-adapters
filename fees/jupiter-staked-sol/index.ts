import { Dependencies, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../../helpers/dune";
import ADDRESSES from "../../helpers/coreAssets.json";
import { JUPITER_METRICS, JUP_TREASURY_SHARE } from "../jupiter";

const STAKE_POOL_RESERVE_ACCOUNT = "FMAWbzuxsgbgndArunedwxXPA6sweaVUGGgadCpSxau2";
const STAKE_POOL_WITHDRAW_AUTHORITY = "EMjuABxELpYWYEwjkKmQKBNCwdaFAy4QYAs6W9bDQDNw";
const LST_FEE_TOKEN_ACCOUNT_OLD = "DG399HKiLgKxGG176QiojyTtiSeqAurK6FVXGfBPTzSD";
const LST_FEE_TOKEN_ACCOUNT_NEW = "GbvFCpMqKX65gQ8KNeob9JUAL7vHCHFSg8YN5bnpPT8g";
const LST_MINT = ADDRESSES.solana.JupSOL;

// The pool mints a 5% fee on every lamport it gains (inflation, MEV tips, priority fees), split 2.5% Sanctum / 2.5% Jupiter
// (https://docs.jup.ag/user-docs/earn/stake-sol/jupsol); onchain the fee account sends half of each sweep to Sanctum, e.g.
// tx 3y473xJxpuGeeMCNXTiyxZHzpgGcefTq2NnfmuGQPRfsB77HyNnpM4E5uiAzQ3P6p5Kr9Y7evWWNWht9Dboh2QuN.
const STAKER_SHARE = 0.95;
const SANCTUM_SHARE = 0.025;
const JUPITER_SHARE = 0.025;
// Jupiter validator identities (vote account CatzoSMUkTRidT5DwBxAC2pEtnwMBTpkCepHkFgZDiqb): once per epoch they send jupSOL's
// share of priority fees to the pool reserve, e.g. tx 3AxJjFRrJdmXoarUNL3FKhDRhEF9ZLQ3qkECeH4owJuMAMPuMeZ5TGikPc9fjQvHuN9Bk8q4CXd8b2YUyrXLL3on.
const JUPITER_VALIDATOR_IDENTITIES = ["JUPiTERrZqgf1jUyR7dSkhMx4Kn2qJyekWsg3LT1h4b", "JUPiTERkf97eKN222JwY7bkpWuJnwqKtT44fsbJfhkr"];
// jupSOL's stake accounts are found by the pool's stake authority, so the JLP pool's stake (counted in jupiter-perpetual) is not included.

const REWARD_LABELS: Record<string, string> = {
  dailyFees: JUPITER_METRICS.JupSOLStakingRewards, // inflation rewards, from sol-lst.sql
  jupsolMevRewards: JUPITER_METRICS.JupSOLMevRewards,
  jupsolPriorityFees: JUPITER_METRICS.JupSOLValidatorPriorityFees,
};

const fetch = async (options: FetchOptions) => {
  const start = `from_unixtime(${options.startTimestamp})`;
  const end = `from_unixtime(${options.endTimestamp})`;
  const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    stake_pool_reserve_account: STAKE_POOL_RESERVE_ACCOUNT,
    stake_pool_withdraw_authority: STAKE_POOL_WITHDRAW_AUTHORITY,
    lst_fee_token_account: options.startOfDay <= 1760486400 ? LST_FEE_TOKEN_ACCOUNT_OLD : LST_FEE_TOKEN_ACCOUNT_NEW,
    lst_mint: LST_MINT,
    exclude_mints_filter: "AND action!='mint'"
  }) + `
UNION ALL
SELECT 'jupsolMevRewards' AS metric_type, COALESCE(SUM(c.amount), 0) / 1e9 AS amount
FROM stake_accounts sa
JOIN jito_tip_distribution_solana.jito_tip_distribution_call_claim c ON c.account_claimant = sa.stake_account_raw
WHERE c.call_block_time >= ${start} AND c.call_block_time < ${end}
UNION ALL
SELECT 'jupsolPriorityFees' AS metric_type, COALESCE(SUM(lamports), 0) / 1e9 AS amount
FROM system_program_solana.system_program_call_transfer
WHERE account_from IN (${JUPITER_VALIDATOR_IDENTITIES.map((a) => `'${a}'`).join(', ')})
  AND account_to = '${STAKE_POOL_RESERVE_ACCOUNT}'
  AND call_block_time >= ${start} AND call_block_time < ${end}
`;

  const results = await queryDuneSql(options, query);

  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  results.forEach((row: any) => {
    const amount = Number(row.amount) || 0;
    const label = REWARD_LABELS[row.metric_type];
    if (label) {
      dailyFees.addCGToken("solana", amount, label);
      dailyRevenue.addCGToken("solana", amount * JUPITER_SHARE, label);
      dailySupplySideRevenue.addCGToken("solana", amount * STAKER_SHARE, JUPITER_METRICS.JupSOLStakingRewardsToStakers);
      dailySupplySideRevenue.addCGToken("solana", amount * SANCTUM_SHARE, JUPITER_METRICS.JupSOLStakingRewardsToSanctum);
    } else if (row.metric_type === 'dailyRevenue') {
      // deposit and withdrawal fees paid into the fee account, in jupSOL
      dailyFees.addCGToken("jupiter-staked-sol", amount, JUPITER_METRICS.JupSOLDepositWithdrawFees);
      dailyRevenue.addCGToken("jupiter-staked-sol", amount, JUPITER_METRICS.JupSOLDepositWithdrawFees);
    }
  });

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue.clone(JUP_TREASURY_SHARE),
    dailySupplySideRevenue,
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  dependencies: [Dependencies.DUNE],
  chains: [CHAIN.SOLANA],
  start: "2024-06-09",
  isExpensiveAdapter: true,
  methodology: {
    Fees: "Staking rewards, Jito MEV tips and Jupiter validator priority fees earned by the jupSOL pool, plus deposit and withdrawal fees.",
    Revenue: "Jupiter's 2.5% of pool rewards (half of the 5% pool fee), plus deposit and withdrawal fees.",
    ProtocolRevenue: "Half of Jupiter's revenue, kept by the treasury. The other half buys back JUP, counted on the Jupiter Aggregator listing.",
    SupplySideRevenue: "95% of pool rewards to jupSOL holders, and 2.5% to Sanctum.",
  },
  breakdownMethodology: {
    Fees: {
      [JUPITER_METRICS.JupSOLStakingRewards]: "Inflation rewards on the pool's stake.",
      [JUPITER_METRICS.JupSOLMevRewards]: "Jito MEV tips claimed by the pool's stake accounts.",
      [JUPITER_METRICS.JupSOLValidatorPriorityFees]: "Jupiter validator priority fees sent to the pool.",
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: "Deposit and withdrawal fees.",
    },
    Revenue: {
      [JUPITER_METRICS.JupSOLStakingRewards]: "Jupiter's 2.5% of inflation rewards.",
      [JUPITER_METRICS.JupSOLMevRewards]: "Jupiter's 2.5% of MEV tips.",
      [JUPITER_METRICS.JupSOLValidatorPriorityFees]: "Jupiter's 2.5% of priority fees.",
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: "Deposit and withdrawal fees.",
    },
    ProtocolRevenue: {
      [JUPITER_METRICS.JupSOLStakingRewards]: "Half of Jupiter's share of inflation rewards, kept by the treasury.",
      [JUPITER_METRICS.JupSOLMevRewards]: "Half of Jupiter's share of MEV tips, kept by the treasury.",
      [JUPITER_METRICS.JupSOLValidatorPriorityFees]: "Half of Jupiter's share of priority fees, kept by the treasury.",
      [JUPITER_METRICS.JupSOLDepositWithdrawFees]: "Half of deposit and withdrawal fees, kept by the treasury.",
    },
    SupplySideRevenue: {
      [JUPITER_METRICS.JupSOLStakingRewardsToStakers]: "95% of pool rewards, to jupSOL holders.",
      [JUPITER_METRICS.JupSOLStakingRewardsToSanctum]: "2.5% of pool rewards, to Sanctum.",
    },
  },
};

export default adapter;
