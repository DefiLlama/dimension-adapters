/**
 * Solana LST (Liquid Staking Token) Factory
 *
 * Generates fee adapters for Solana liquid staking protocols that use the
 * SPL Stake Pool program. All adapters share the same Dune SQL query
 * (helpers/queries/sol-lst.sql) but differ in:
 *   - Stake pool addresses (reserve, withdraw authority, fee token account, mint)
 *   - How revenue is reported (addCGToken vs add/addToken with raw amounts)
 *   - Fee/revenue splitting ratios (supply side vs protocol)
 *   - Metric tags (some use METRIC.*, some don't)
 *   - Methodology text and breakdown methodology
 *   - Start dates
 *   - Additional return fields (dailyHoldersRevenue, dailySupplySideRevenue)
 *
 * Adapters NOT covered by this factory (too different):
 *   - jupiter-staked-sol (custom JUPITER_METRICS + buyback ratio logic)
 *   - kyros (completely different SQL and data model)
 *   - crypto-com-lst (multi-chain with EVM logic on Cronos)
 *   - hylo-lst (queries two separate stake pools)
 */

import { Dependencies, FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { METRIC } from "../helpers/metrics";
import ADDRESSES from "../helpers/coreAssets.json";
import { createFactoryExports } from "./registry";

// --- Revenue handling strategies ---

// How the dailyRevenue row is added to balances
type RevenueMethod =
  | { type: "addCGToken"; cgId: string; metric?: string }
  | { type: "add"; mint: string; metric?: string }
  | { type: "addToken"; mint: string; metric?: string };

// How dailyFees staking rewards row is handled
interface FeesConfig {
  metric?: string; // METRIC tag for staking rewards on fees, undefined = no metric
}

// How supply-side revenue is computed from staking rewards
interface SupplySideConfig {
  enabled: boolean;
  ratio: number; // fraction of staking rewards going to supply side
  metric?: string;
}

// How protocol-level revenue split works on staking rewards
interface StakingRevenueConfig {
  enabled: boolean;
  ratio: number; // fraction of staking rewards going to protocol revenue
  metric?: string;
}

// Whether revenue row also gets added to dailyFees
interface RevenueFeedbackConfig {
  addToFees: boolean;
  feesMetric?: string;
}

interface SolLstConfig {
  stakePoolReserveAccount: string;
  stakePoolWithdrawAuthority: string;
  lstFeeTokenAccount: string;
  lstMint: string;
  start: string;

  // Optional: dynamic fee token account based on timestamp
  lstFeeTokenAccountSwitcher?: (startOfDay: number) => string;

  // Revenue handling
  revenue: RevenueMethod;

  // Fees staking rewards config
  fees: FeesConfig;

  // Supply side revenue
  supplySide: SupplySideConfig;

  // Staking revenue split to protocol
  stakingRevenue: StakingRevenueConfig;

  // Whether revenue metric row also gets added to dailyFees
  revenueFeedback: RevenueFeedbackConfig;

  // Extra return fields
  returnDailyHoldersRevenue?: boolean | number; // false = not included, 0 = explicit zero
  returnDailyProtocolRevenue?: boolean; // whether to include dailyProtocolRevenue (defaults to true)

  // Methodology
  methodology?: Record<string, string>;
  breakdownMethodology?: Record<string, Record<string, string>>;
}

// --- Default methodology generators ---

const DEFAULT_METHODOLOGY: Record<string, string> = {
  Fees: "Staking rewards from staked SOL",
  Revenue: "Includes withdrawal fees and management fees collected by fee collector",
  ProtocolRevenue: "Revenue going to treasury/team",
};

function getMethodology(config: SolLstConfig): Record<string, string> {
  if (config.methodology) return config.methodology;

  const m: Record<string, string> = { ...DEFAULT_METHODOLOGY };

  if (config.supplySide.enabled)
    m.SupplySideRevenue = `${Math.round(config.supplySide.ratio * 100)}% of the staking rewards go to stakers`;

  if (config.returnDailyHoldersRevenue === 0)
    m.HoldersRevenue = "No revenue share to token holders";

  return m;
}

function getBreakdownMethodology(config: SolLstConfig): Record<string, Record<string, string>> | undefined {
  if (config.breakdownMethodology) return config.breakdownMethodology;

  // Only generate breakdown methodology when metrics are actually used
  const hasAnyMetric = config.fees.metric
    || (config.revenue as any).metric
    || config.supplySide.metric
    || config.stakingRevenue.metric;
  if (!hasAnyMetric) return undefined;

  const breakdown: Record<string, Record<string, string>> = {};

  // Fees breakdown
  const feesBreakdown: Record<string, string> = {};
  if (config.fees.metric)
    feesBreakdown[config.fees.metric] = "Staking rewards from staked SOL";
  if (config.revenueFeedback.addToFees && config.revenueFeedback.feesMetric)
    feesBreakdown[config.revenueFeedback.feesMetric] = "Includes withdrawal fees and management fees";
  if (Object.keys(feesBreakdown).length > 0) breakdown.Fees = feesBreakdown;

  // Revenue breakdown
  const rev = config.revenue;
  if ('metric' in rev && rev.metric) {
    breakdown.Revenue = { [rev.metric]: "Includes withdrawal fees and management fees" };
    breakdown.ProtocolRevenue = { [rev.metric]: "Includes withdrawal fees and management fees" };
  }

  // Staking revenue breakdown
  if (config.stakingRevenue.enabled && config.stakingRevenue.metric) {
    if (!breakdown.Revenue) breakdown.Revenue = {};
    breakdown.Revenue[config.stakingRevenue.metric] = "Protocol share of staking rewards";
    if (!breakdown.ProtocolRevenue) breakdown.ProtocolRevenue = {};
    breakdown.ProtocolRevenue[config.stakingRevenue.metric] = "Protocol share of staking rewards";
  }

  // Supply side breakdown
  if (config.supplySide.enabled && config.supplySide.metric) {
    breakdown.SupplySideRevenue = {
      [config.supplySide.metric]: `${Math.round(config.supplySide.ratio * 100)}% of the staking rewards are distributed to stakers`,
    };
  }

  return Object.keys(breakdown).length > 0 ? breakdown : undefined;
}

function createSolLstAdapter(config: SolLstConfig): SimpleAdapter {
  const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const lstFeeTokenAccount = config.lstFeeTokenAccountSwitcher
      ? config.lstFeeTokenAccountSwitcher(options.startOfDay)
      : config.lstFeeTokenAccount;

    const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
      start: options.startTimestamp,
      end: options.endTimestamp,
      stake_pool_reserve_account: config.stakePoolReserveAccount,
      stake_pool_withdraw_authority: config.stakePoolWithdrawAuthority,
      lst_fee_token_account: lstFeeTokenAccount,
      lst_mint: config.lstMint,
    });

    const results = await queryDuneSql(options, query);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = config.supplySide.enabled ? options.createBalances() : undefined;

    results.forEach((row: any) => {
      if (row.metric_type === "dailyFees") {
        // Staking rewards always go to dailyFees as SOL
        if (config.fees.metric) {
          dailyFees.addCGToken("solana", row.amount || 0, config.fees.metric);
        } else {
          dailyFees.addCGToken("solana", row.amount || 0);
        }

        // Supply side revenue from staking rewards
        if (config.supplySide.enabled && dailySupplySideRevenue) {
          const supplySideAmount = Number(row.amount) * config.supplySide.ratio || 0;
          if (config.supplySide.metric) {
            dailySupplySideRevenue.addCGToken("solana", supplySideAmount, config.supplySide.metric);
          } else {
            dailySupplySideRevenue.addCGToken("solana", supplySideAmount);
          }
        }

        // Staking revenue split to protocol
        if (config.stakingRevenue.enabled) {
          const stakingRevenueAmount = Number(row.amount) * config.stakingRevenue.ratio || 0;
          if (config.stakingRevenue.metric) {
            dailyRevenue.addCGToken("solana", stakingRevenueAmount, config.stakingRevenue.metric);
          } else {
            dailyRevenue.addCGToken("solana", stakingRevenueAmount);
          }
        }
      } else if (row.metric_type === "dailyRevenue") {
        // Revenue handling varies by adapter
        const rev = config.revenue;
        if (rev.type === "addCGToken") {
          if (rev.metric) {
            dailyRevenue.addCGToken(rev.cgId, row.amount || 0, rev.metric);
          } else {
            dailyRevenue.addCGToken(rev.cgId, row.amount || 0);
          }
        } else if (rev.type === "add") {
          if (rev.metric) {
            dailyRevenue.add(rev.mint, Number(row.amount) * 1e9 || 0, rev.metric);
          } else {
            dailyRevenue.add(rev.mint, Number(row.amount) * 1e9 || 0);
          }
        } else if (rev.type === "addToken") {
          dailyRevenue.addToken(rev.mint, Number(row.amount) * 1e9 || 0);
        }

        // Some adapters also add revenue to dailyFees
        if (config.revenueFeedback.addToFees) {
          const rev = config.revenue;
          if (rev.type === "addCGToken") {
            if (config.revenueFeedback.feesMetric) {
              dailyFees.addCGToken(rev.cgId, row.amount || 0, config.revenueFeedback.feesMetric);
            } else {
              dailyFees.addCGToken(rev.cgId, row.amount || 0);
            }
          } else if (rev.type === "add") {
            if (config.revenueFeedback.feesMetric) {
              dailyFees.add(rev.mint, Number(row.amount) * 1e9 || 0, config.revenueFeedback.feesMetric);
            } else {
              dailyFees.add(rev.mint, Number(row.amount) * 1e9 || 0);
            }
          } else if (rev.type === "addToken") {
            dailyFees.addToken(rev.mint, Number(row.amount) * 1e9 || 0);
          }
        }
      }
    });

    const result: any = {
      dailyFees,
      dailyRevenue,
    };

    if (config.returnDailyProtocolRevenue !== false) {
      result.dailyProtocolRevenue = dailyRevenue;
    }

    if (dailySupplySideRevenue) {
      result.dailySupplySideRevenue = dailySupplySideRevenue;
    }

    if (config.returnDailyHoldersRevenue === 0) {
      result.dailyHoldersRevenue = 0;
    }

    return result;
  };

  const methodology = getMethodology(config);
  const breakdownMethodology = getBreakdownMethodology(config);

  const adapter: SimpleAdapter = {
    version: 1,
    fetch,
    chains: [CHAIN.SOLANA],
    start: config.start,
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    methodology,
    ...(breakdownMethodology ? { breakdownMethodology } : {}),
  };

  return adapter;
}

// --- Default configs for the "simple" pattern ---
// Many adapters use the exact same pattern: fees as SOL, revenue as add(mint, amount*1e9),
// return dailyFees + dailyRevenue + dailyProtocolRevenue = dailyRevenue

function simpleConfig(overrides: Partial<SolLstConfig> & Pick<SolLstConfig, "stakePoolReserveAccount" | "stakePoolWithdrawAuthority" | "lstFeeTokenAccount" | "lstMint" | "start">): SolLstConfig {
  return {
    fees: {},
    supplySide: { enabled: false, ratio: 0 },
    stakingRevenue: { enabled: false, ratio: 0 },
    revenue: { type: "add", mint: overrides.lstMint },
    revenueFeedback: { addToFees: false },
    ...overrides,
  };
}

// --- All adapter configs ---

const configs: Record<string, SolLstConfig> = {
  "adrastea-lst": simpleConfig({
    stakePoolReserveAccount: "GqRNB5aREYNkijweeqUhoCKNWWUgbBpEqfDJL6ixvjng",
    stakePoolWithdrawAuthority: "DJ5zc5UhPCAbFhudnw1RqrgcQimUzh5th6WEGtTN12NS",
    lstFeeTokenAccount: "HYHn839DPwEoYoroGNxKq1uU3XXV77tfKdV8nmpRWv7g",
    lstMint: "sctmY8fJucsJatwHz6P48RuWBBkdBMNmSMuBYrWFdrw",
    start: "2025-03-08",
    // NOTE: adrastea uses addToken instead of add
    revenue: { type: "addToken", mint: "sctmY8fJucsJatwHz6P48RuWBBkdBMNmSMuBYrWFdrw" },
    methodology: {
      Fees: "Staking rewards from staked SOL on Adrastea staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector.",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "backpack-staked-sol": simpleConfig({
    stakePoolReserveAccount: "C6nDiFyQH8vbVyfGhgpCfzWbHixf5Kq3MUN5vFCdJ4qP",
    stakePoolWithdrawAuthority: "5hhYv4b1Bt5sdMGYyyvpciwRbyUD1ZWeCmTaQcuvb7Eg",
    lstFeeTokenAccount: "G2hGzCcDUJdtTSVLazEGfaMVEGWxEwWrnyy8TuTmP25j",
    lstMint: "BPSoLzmLQn47EP5aa7jmFngRL8KC3TWAeAwXwZD8ip3P",
    start: "2025-02-24",
    revenue: { type: "add", mint: "BPSoLzmLQn47EP5aa7jmFngRL8KC3TWAeAwXwZD8ip3P", metric: METRIC.MANAGEMENT_FEES },
    fees: { metric: METRIC.STAKING_REWARDS },
    breakdownMethodology: {
      Fees: {
        [METRIC.STAKING_REWARDS]: "Staking rewards from staked SOL on Backpack staked solana",
      },
      Revenue: {
        [METRIC.MANAGEMENT_FEES]: "Includes withdrawal fees and management fees collected by fee collector",
      },
    },
  }),

  "binance-staked-sol": {
    stakePoolReserveAccount: "9xcCvbbAAT9XSFsMAsCeR8CEbxutj15m5BfNr4DEMQKn",
    stakePoolWithdrawAuthority: "75NPzpxoh8sXGuSENFMREidq6FMzEx4g2AfcBEB6qjCV",
    lstFeeTokenAccount: "3ZC6mkJr9hnFSrVHzXXcPopw3SArgKGm8agcah1vhy2Z",
    lstMint: (ADDRESSES.solana as any).BNSOL,
    start: "2024-09-12",
    fees: { metric: METRIC.STAKING_REWARDS },
    revenue: { type: "addCGToken", cgId: "binance-staked-sol", metric: METRIC.DEPOSIT_WITHDRAW_FEES },
    revenueFeedback: { addToFees: true, feesMetric: METRIC.DEPOSIT_WITHDRAW_FEES },
    supplySide: { enabled: true, ratio: 0.9, metric: METRIC.STAKING_REWARDS },
    stakingRevenue: { enabled: true, ratio: 0.1, metric: METRIC.STAKING_REWARDS },
    methodology: {
      Fees: "Staking rewards from staked SOL on binance staked solana",
      Revenue: "Binance takes a 10% comission on the staking rewards",
      ProtocolRevenue: "Revenue going to treasury/team",
      SupplySideRevenue: "90% of the staking rewards go to stakers",
    },
    breakdownMethodology: {
      Fees: {
        [METRIC.STAKING_REWARDS]: "Staking rewards from staked SOL on Binance",
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes withdrawal fees",
      },
      Revenue: {
        [METRIC.STAKING_REWARDS]: "Binance takes a 10% performance fee on the staking rewards",
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes withdrawal fees",
      },
      ProtocolRevenue: {
        [METRIC.STAKING_REWARDS]: "Binance takes a 10% performance fee on the staking rewards",
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes withdrawal fees",
      },
      SupplySideRevenue: {
        [METRIC.STAKING_REWARDS]: "90% of the staking rewards are distributed to bnSOL",
      },
    },
  },

  "bitget-staked-sol": simpleConfig({
    stakePoolReserveAccount: "2nWzbtYUUX5ZDiJEqvqsJJZgddY1xfJJJP1SLWyLePVU",
    stakePoolWithdrawAuthority: "EVhp44NGYxxrxhv2NyFyErEKcsiffvssju5K7C5xydye",
    lstFeeTokenAccount: "APWc1VvzLXV5rKTq5mz87GmNn36cLW9v94nLkKwpJzPC",
    lstMint: "bgSoLfRx1wRPehwC9TyG568AGjnf1sQG1MYa8s3FbfY",
    start: "2025-02-16",
    methodology: {
      Fees: "Staking rewards from staked SOL on Bitget staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "blazestake": {
    stakePoolReserveAccount: "rsrxDvYUXjH1RQj2Ke36LNZEVqGztATxFkqNukERqFT",
    stakePoolWithdrawAuthority: "6WecYymEARvjG5ZyqkrVQ6YkhPfujNzWpSPwNKXHCbV2",
    lstFeeTokenAccount: "Dpo148tVGewDPyh2FkGV18gouWctbdX2fHJopJGe9xv1",
    lstMint: (ADDRESSES.solana as any).bSOL,
    start: "2022-12-07",
    fees: { metric: METRIC.STAKING_REWARDS },
    revenue: { type: "addCGToken", cgId: "blazestake-staked-sol", metric: METRIC.DEPOSIT_WITHDRAW_FEES },
    revenueFeedback: { addToFees: true, feesMetric: METRIC.DEPOSIT_WITHDRAW_FEES },
    supplySide: { enabled: true, ratio: 1.0, metric: METRIC.STAKING_REWARDS },
    stakingRevenue: { enabled: false, ratio: 0 },
    returnDailyHoldersRevenue: 0,
    methodology: {
      Fees: "Staking rewards from staked SOL on blazestake",
      Revenue: "Includes 0.1% instant withdrawal fee and 0.1% delayed withdrawal fee",
      SupplySideRevenue: "All the staking rewards are distributed to bSOL",
      ProtocolRevenue: "All fees going to treasury/DAO (50% of total fees) + All fees going to the team(50% of total fees)",
      HoldersRevenue: "No revenue share to BLZE token holders",
    },
    breakdownMethodology: {
      Fees: {
        [METRIC.STAKING_REWARDS]: "Staking rewards from staked SOL on Blazestake",
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes 0.1% instant withdrawal fee and 0.1% delayed withdrawal fee",
      },
      Revenue: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes 0.1% instant withdrawal fee and 0.1% delayed withdrawal fee",
      },
      ProtocolRevenue: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes 0.1% instant withdrawal fee and 0.1% delayed withdrawal fee",
      },
      SupplySideRevenue: {
        [METRIC.STAKING_REWARDS]: "All the staking rewards are distributed to bSOL",
      },
    },
  },

  "bonk-staked-sol": simpleConfig({
    stakePoolReserveAccount: "5htyN73FSd1dvv8LEHrmy4EiDkXtrGn5EXv5ZizqVF3X",
    stakePoolWithdrawAuthority: "9LcmMfufi8YUcx83RALwF9Y9BPWZ7SqGy4D9VLe2nhhA",
    lstFeeTokenAccount: "2azKdTLTd7xBF3mKjVBrrpj5jgJHoCRXLNpFjhfgzXwv",
    lstMint: "BonK1YhkXEGLZzwtcvRTip3gAL9nCeQD7ppZBLXhtTs",
    start: "2024-07-17",
    methodology: {
      Fees: "Staking rewards from staked SOL on Bonk staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "bybit-staked-sol": {
    stakePoolReserveAccount: "7huMsYqSXb1m4okiAJgQLPTamgHD2GvWhAou7vhzF51r",
    stakePoolWithdrawAuthority: "3pFTQjRVwcJHSpUNH5n1hx6Jwx7V3EzJDDHaKuwExyGJ",
    lstFeeTokenAccount: "HcacehDEp8W4wSdy2oi4HgVoSWwMJDr1kZwXUBSuFfKK",
    lstMint: (ADDRESSES.solana as any).bbSOL,
    start: "2024-09-07",
    fees: { metric: METRIC.STAKING_REWARDS },
    revenue: { type: "addCGToken", cgId: "bybit-staked-sol", metric: METRIC.DEPOSIT_WITHDRAW_FEES },
    revenueFeedback: { addToFees: true, feesMetric: METRIC.DEPOSIT_WITHDRAW_FEES },
    supplySide: { enabled: true, ratio: 1.0, metric: METRIC.STAKING_REWARDS },
    stakingRevenue: { enabled: false, ratio: 0 },
    methodology: {
      Fees: "Staking rewards from staked SOL on bybit staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
      SupplySideRevenue: "All the staking rewards go to stakers",
    },
    breakdownMethodology: {
      Fees: {
        [METRIC.STAKING_REWARDS]: "Staking rewards from staked SOL on Bybit",
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes a 0.1% deposit fee",
      },
      Revenue: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes a 0.1% deposit fee",
      },
      ProtocolRevenue: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes a 0.1% deposit fee",
      },
      SupplySideRevenue: {
        [METRIC.STAKING_REWARDS]: "All the staking rewards are distributed to bbSOL",
      },
    },
  },

  "chimpions-staked-sol": simpleConfig({
    stakePoolReserveAccount: "9sis22RdDX8r5JxqfUmfCePrmNqzdXM4Ri5JHPbW4tKC",
    stakePoolWithdrawAuthority: "8r1we5gARtq96VJ6zuSEpdgZ9Y1Jqw6wQFQtj78VJFoP",
    lstFeeTokenAccount: "295f8DmXDKDR4syXCzTr5kRVLCvotvj3YGu5vbxHGFgX",
    lstMint: "sctmZbtfE4dBNBEqBriQQVZLBrTaTjiTfKNRzKUcSLa",
    start: "2025-02-19",
    methodology: {
      Fees: "Staking rewards from staked SOL on Chimpions staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "definity-staked-sol": simpleConfig({
    stakePoolReserveAccount: "G6ncaiwGJ1A5kCRkaogWbrsrEBvmmUWZr4ZhsTgAEckp",
    stakePoolWithdrawAuthority: "5ugu8RogBq5ZdfGt4hKxKotRBkndiV1ndsqWCf7PBmST",
    lstFeeTokenAccount: "BVWVFqB9UGTqh4jFgBeTg2JjgxD7jPEAZhZPLTztx2h",
    lstMint: "DEF1NXSZ8Th9n28hYBayrFtx9bj1EwwTiy3mhHEB9oyA",
    start: "2025-01-30",
    methodology: {
      Fees: "Staking rewards from staked SOL on Definity staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "dfdv-staked-sol": simpleConfig({
    stakePoolReserveAccount: "CqVtn1fw7LJQ2u8oNd2KktYy19tZmQFjnNb1pCgKb7bX",
    stakePoolWithdrawAuthority: "7cWNhDsHe1m36ttDkJVBgbee1hRFvPqWZT2iWaBAyYGW",
    lstFeeTokenAccount: "2bYnNsPqkJmxnE7VjtGLDZomN3KdnsuFFJ6QVFku7jEf",
    lstMint: "sctmB7GPi5L2Q5G9tUSzXvhZ4YiDMEGcRov9KfArQpx",
    start: "2025-02-12",
    methodology: {
      Fees: "Staking rewards from staked SOL on Defi Development Fund staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "doublezero-staked-sol": simpleConfig({
    stakePoolReserveAccount: "FFtERWBSCkScg8spA2mNB9zN5SdH16NqQywXw3bbB1aJ",
    stakePoolWithdrawAuthority: "4cpnpiwgBfUgELVwNYiecwGti45YHSH3R72CPkFTiwJt",
    lstFeeTokenAccount: "GhN6PpyP6Ln4ycWcyvqsNcowLfYjpUcA9uWKAcFBjj2D",
    lstMint: "Gekfj7SL2fVpTDxJZmeC46cTYxinjB6gkAnb6EGT6mnn",
    start: "2025-07-25",
    // doublezero uses addCGToken with a conditional cgId based on timestamp
    revenue: { type: "addCGToken", cgId: "doublezero-staked-sol" },
    revenueFeedback: { addToFees: false },
    returnDailyHoldersRevenue: 0,
    methodology: {
      Fees: "Staking rewards from staked SOL on doublezero staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
      HoldersRevenue: "No revenue share to 2Z token holers.",
    },
  }),

  "drift-staked-sol": {
    stakePoolReserveAccount: "4RjzgujRmdadbLjyh2L1Qn5ECsQ1qfjaapTfeWKYtsC3",
    stakePoolWithdrawAuthority: "6727ZvQ2YEz8jky1Z9fqDFG5mYuAvC9G34o2MxwzmrUK",
    lstFeeTokenAccount: "4ipvqrPR7dvkRPJ9iHhAxY7NfcgCSrZw5KLH3K8aAbCM",
    lstMint: (ADDRESSES.solana as any).dSOL,
    start: "2024-08-26",
    lstFeeTokenAccountSwitcher: (startOfDay: number) =>
      startOfDay <= 1762646400
        ? "5NJUMVJPVxN5huLKQ7tNxBv7LHxHDLwREUym5ekfdSgD"
        : "4ipvqrPR7dvkRPJ9iHhAxY7NfcgCSrZw5KLH3K8aAbCM",
    fees: { metric: METRIC.STAKING_REWARDS },
    revenue: { type: "addCGToken", cgId: "drift-staked-sol", metric: METRIC.DEPOSIT_WITHDRAW_FEES },
    revenueFeedback: { addToFees: true, feesMetric: METRIC.DEPOSIT_WITHDRAW_FEES },
    supplySide: { enabled: true, ratio: 1.0, metric: METRIC.STAKING_REWARDS },
    stakingRevenue: { enabled: false, ratio: 0 },
    returnDailyHoldersRevenue: 0,
    methodology: {
      Fees: "Staking rewards from staked SOL on drift staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
      HoldersRevenue: "No revenue share to DRIFT token holders",
      SupplySideRevenue: "All the staking rewards go to stakers",
    },
    breakdownMethodology: {
      Fees: {
        [METRIC.STAKING_REWARDS]: "Staking rewards from staked SOL on Drift",
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes instant and delayed withdrawal fees",
      },
      Revenue: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes instant and delayed withdrawal fees",
      },
      ProtocolRevenue: {
        [METRIC.DEPOSIT_WITHDRAW_FEES]: "Includes instant and delayed withdrawal fees",
      },
      SupplySideRevenue: {
        [METRIC.STAKING_REWARDS]: "All the staking rewards are distributed to dSOL",
      },
    },
  },

  "edgevana": simpleConfig({
    stakePoolReserveAccount: "edgekdZD5d1bd4WKBxVhYKik2RgH8cBrYCBVqmQzuNJ",
    stakePoolWithdrawAuthority: "FZEaZMmrRC3PDPFMzqooKLS2JjoyVkKNd2MkHjr7Xvyq",
    lstFeeTokenAccount: "AJfw28SHAv5TiDXNUFLDKtmh8H7wkcjmeyc7ESbzsxRU",
    lstMint: "edge86g9cVz87xcpKpy3J77vbp4wYd9idEV562CCntt",
    start: "2024-02-16",
    revenue: { type: "addCGToken", cgId: "edgevana-staked-sol" },
    methodology: {
      Fees: "Staking rewards from staked SOL on Edgevana staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector.",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "forward-ind-staked-sol": simpleConfig({
    stakePoolReserveAccount: "FDjBN7LDysGEDvyy4hgh8sSP9ugVyGAS7spoYBkUnbTb",
    stakePoolWithdrawAuthority: "3ndMuPC9Cz5VC4RJkpoPaZz6Px6eVXtRenw9Yi1o2xnA",
    lstFeeTokenAccount: "65Yk58ozpXDEgywHewvP1Z7KWhW4w7aSftwiDrsj48V8",
    lstMint: "cPQPBN7WubB3zyQDpzTK2ormx1BMdAym9xkrYUJsctm",
    start: "2025-11-11",
    methodology: {
      Fees: "Staking rewards from staked SOL on forward industries staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "gate-staked-sol": simpleConfig({
    stakePoolReserveAccount: "BtA3imeHqVVVKR5kcQnHzcx7pPJsiJQxMbs1G6q2sVAz",
    stakePoolWithdrawAuthority: "9BadxcrgcZ1in6CfVMsU6PHU45rzLrEjcd4FQMjXNbM5",
    lstFeeTokenAccount: "EhuPBi5xhDyLTvjLL5eGnjNFu2h6ni4BPozACxM53pfo",
    lstMint: "gateMurAxe4YFoUR6J63gXGKtkbTfdkMdLjZrCmThFP",
    start: "2025-08-21",
    methodology: {
      Fees: "Staking rewards from staked SOL on Gate staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "helius-staked-sol": simpleConfig({
    stakePoolReserveAccount: "xdmLgScxrbbUu2gx7j2iqQXVKZYBCTDiCtR7AsHHJYQ",
    stakePoolWithdrawAuthority: "2rMuGTyXCqCHZBSu6NZR9Aq8MhZX9gLkCHoQsPhSj2YF",
    lstFeeTokenAccount: "C1mXWyT6CpiatsC2ob4tTTdT6nHJBVmcPzrV5oAXXDT5",
    lstMint: "he1iusmfkpAdwvxLNGV8Y1iSbj4rUy6yMhEA3fotn9A",
    start: "2024-07-17",
    methodology: {
      Fees: "Staking rewards from staked SOL on Helius staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "jagpool-staked-sol": simpleConfig({
    stakePoolReserveAccount: "jagDaER73YqodaLRGpYMvEjRjVCx962LLebG9QGh11X",
    stakePoolWithdrawAuthority: "Hodkwm8xf43JzRuKNYPGnYJ7V9cXZ7LJGNy96TWQiSGN",
    lstFeeTokenAccount: "FmgHwwS3kobaG8JGWktihfS5DEC8oWvNpD1uKBMqtcAz",
    lstMint: "jag58eRBC1c88LaAsRPspTMvoKJPbnzw9p9fREzHqyV",
    start: "2024-11-24",
    methodology: {
      Fees: "Staking rewards from staked SOL on JagPool staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

/*   "jito-staked-sol": {  // still using adapter file for this
    stakePoolReserveAccount: "BgKUXdS29YcHCFrPm5M8oLHiTzZaMDjsebggjoaQ6KFL",
    stakePoolWithdrawAuthority: "6iQKfEyhr3bZMotVkW6beNZz5CPAkiwvgV2CTje9pVSS",
    lstFeeTokenAccount: "feeeFLLsam6xZJFc6UQFrHqkvVt4jfmVvi2BRLkUZ4i",
    lstMint: (ADDRESSES.solana as any).JitoSOL,
    start: "2024-04-08",
    fees: { metric: METRIC.STAKING_REWARDS },
    // Jito: revenue is commented out, only supply side at 96%
    revenue: { type: "addCGToken", cgId: "jito-staked-sol" },
    revenueFeedback: { addToFees: false },
    supplySide: { enabled: true, ratio: 0.96, metric: METRIC.STAKING_REWARDS },
    stakingRevenue: { enabled: false, ratio: 0 },
    returnDailyProtocolRevenue: false,
    methodology: {
      Fees: "Staking rewards from staked SOL on jito staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector.",
      ProtocolRevenue: "Revenue going to treasury/team",
      HoldersRevenue: "No revenue share to JTO token holders.",
      SupplySideRevenue: "96% of the staking rewards go to stakers",
    },
    breakdownMethodology: {
      Fees: {
        [METRIC.STAKING_REWARDS]: "Staking rewards from staked SOL on Jito",
      },
      SupplySideRevenue: {
        [METRIC.STAKING_REWARDS]: "96% of the staking rewards are distributed to jitoSOL",
      },
    },
  }, */

  "jpool-staked-sol": simpleConfig({
    stakePoolReserveAccount: "AXu3DTw9AFq9FDTzX4vqA3XiT7LjrS5DpbsZaPpEx6qR",
    stakePoolWithdrawAuthority: "HbJTxftxnXgpePCshA8FubsRj9MW4kfPscfuUfn44fnt",
    lstFeeTokenAccount: "GLysLmE2bwaTNCioDoadMvt9A4RvdFokE4BZwuFoeSn4",
    lstMint: "7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn",
    start: "2022-09-05",
    revenue: { type: "addCGToken", cgId: "jpool" },
    methodology: {
      Fees: "Staking rewards from staked SOL on jpool staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector.",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "laine-staked-sol": simpleConfig({
    stakePoolReserveAccount: "H2HfvQc8JcZxCvAQNdYou9jYHSo2oUU8aadqo2wQ1vK",
    stakePoolWithdrawAuthority: "AAbVVaokj2VSZCmSU5Uzmxi6mxrG1n6StW9mnaWwN6cv",
    lstFeeTokenAccount: "FQLvrMDsqJ2brYQRqG2Cgp5hvAJ7Z8C7boMtdi75iX7W",
    lstMint: "LAinEtNLgpmCP9Rvsf5Hn8W6EhNiKLZQti1xfWMLy6X",
    start: "2022-10-22",
    methodology: {
      Fees: "Staking rewards from staked SOL on Laine staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "lantern-staked-sol": simpleConfig({
    stakePoolReserveAccount: "EH7jVtxJbpMNwmkJFREAEPBseTmE5CTNtLC4Wh8u48eS",
    stakePoolWithdrawAuthority: "6Sw4WcMTakZFrd19Q4hTH8ewiLxXXTCuBdVxAaneg1fo",
    lstFeeTokenAccount: "3BTsa5vnmQ2CfDNNABjSPff6RqdXQUxjcKwGiF4mn3aE",
    lstMint: "LnTRntk2kTfWEY6cVB8K9649pgJbt6dJLS1Ns1GZCWg",
    start: "2024-07-17",
    revenue: { type: "addCGToken", cgId: "lantern-staked-sol" },
    methodology: {
      Fees: "Staking rewards from staked SOL on Lantern staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "marginfi-staked-sol": simpleConfig({
    stakePoolReserveAccount: "3b7XQeZ8nSMyjcQGTFJS5kBw4pXS2SqtB9ooHCnF2xV9",
    stakePoolWithdrawAuthority: "2C9aTiNL6VyrPhFKspZC8BY9JeL3j4RtkPP2e4PrVAwP",
    lstFeeTokenAccount: "3zaVJxg2HCEYF9n2ndgm2SemrDiYniru7oS26yb7fep2",
    lstMint: "LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp",
    start: "2024-07-17",
    methodology: {
      Fees: "Staking rewards from staked SOL on MarginFi staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "phantom-staked-sol": simpleConfig({
    stakePoolReserveAccount: "pRERruHknFdCVq4vU21TR7NWPmxh3CB7kNJoEtH8ew5",
    stakePoolWithdrawAuthority: "2zeXA69dFoMLFLdzCfcff35aL7Y7uBZnjKBGWtESgVfS",
    lstFeeTokenAccount: "4DT8ffnyaaYxeDD9nyQFpfc213TjL2xeMiFZeCyhKeXQ",
    lstMint: "pSo1f9nQXWgXibFtKf7NWYxb5enAM4qfP6UJSiXRQfL",
    start: "2025-03-26",
    revenue: { type: "addCGToken", cgId: "phantom-staked-sol" },
    methodology: {
      Fees: "Staking rewards from staked SOL on phantom staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "pico-staked-sol": simpleConfig({
    stakePoolReserveAccount: "2ArodFTZhNqVWJT92qEGDxigAvouSo1kfgfEcC3KEWUK",
    stakePoolWithdrawAuthority: "4At8nQXanWgRvjbrVXmxMBBdfz39txWVm4SiXEoP1kGh",
    lstFeeTokenAccount: "D7mq9oAPygsof9R8uaqfeMAujvJnWp6AoCHsLKtgwGX7",
    lstMint: "picobAEvs6w7QEknPce34wAE4gknZA9v5tTonnmHYdX",
    start: "2024-07-19",
    methodology: {
      Fees: "Staking rewards from staked SOL on Pico staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "save-staked-sol": simpleConfig({
    stakePoolReserveAccount: "FL2AsvZPTW33QdmBgQx15ZdtaSbmuwY3oBCJMj63u9W1",
    stakePoolWithdrawAuthority: "9yWcz4S27nXKpsVmWqaimphCUnFo441JUvwkzmvRWys3",
    lstFeeTokenAccount: "5VyLWq6nGg8mkAsHUwn6KqnaTni6hFZHb6dGiV7dCtGz",
    lstMint: "SAVEDpx3nFNdzG3ymJfShYnrBuYy7LtQEABZQ3qtTFt",
    start: "2025-03-31",
    methodology: {
      Fees: "Staking rewards from staked SOL on save staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "solayer-staked-sol": simpleConfig({
    stakePoolReserveAccount: "Brh9rB6npnjM1vDXyCXtzkXVGRnsh6KHqmBz26tVACg9",
    stakePoolWithdrawAuthority: "H5rmot8ejBUWzMPt6E44h27xj5obbSz3jVuK4AsJpHmv",
    lstFeeTokenAccount: "ARs3HTD79nsaUdDKqfGhgbNMVJkXVdRs2EpHAm4LNEcq",
    lstMint: "sSo1wxKKr6zW2hqf5hZrp2CawLibcwi1pMBqk5bg2G4",
    start: "2024-05-23",
    // NOTE: solayer uses addToken instead of add
    revenue: { type: "addToken", mint: "sSo1wxKKr6zW2hqf5hZrp2CawLibcwi1pMBqk5bg2G4" },
    methodology: {
      Fees: "Staking rewards from staked SOL on Solayer staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector.",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "starke-staked-sol": simpleConfig({
    stakePoolReserveAccount: "ETEu7ShVpBmtX7YYH3GBX2mLxW8gLXz1SBzQo92Fb5Z1",
    stakePoolWithdrawAuthority: "8uKJ5wLUFXYdqTJw2JHRzdcWB8JLR96mEf9dreqD6d5X",
    lstFeeTokenAccount: "BtMP5Zka6Hxx5CAZDj4juUBKQBiTyyVv43GTuLhzV5o4",
    lstMint: "EPCz5LK372vmvCkZH3HgSuGNKACJJwwxsofW6fypCPZL",
    start: "2024-07-17",
    methodology: {
      Fees: "Staking rewards from staked SOL on Starke staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "stke-staked-sol": simpleConfig({
    stakePoolReserveAccount: "HHnQYTNjtrbuHgQhERpGQfgu11ngXEvyjiG9qb4ZvbNC",
    stakePoolWithdrawAuthority: "5vzKiHVuZNx1XQWQZQEcuqKaq4nfDp6LhuSvowQK2ayd",
    lstFeeTokenAccount: "83EkhGsprbJxJu4S6Tv16UPzR6sL2Kr86DfTJohZjbDX",
    lstMint: "stke7uu3fXHsGqKVVjKnkmj65LRPVrqr4bLG2SJg7rh",
    start: "2025-07-17",
    methodology: {
      Fees: "Staking rewards from staked SOL on STKE staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "stronghold-staked-sol": simpleConfig({
    stakePoolReserveAccount: "8mrW4dHwD8hK6oET1aCisFLmLMx41Z4Hzypqi2yCaV8w",
    stakePoolWithdrawAuthority: "ABCTazdzA7j6CHbnuetnWuvpeKh2XmxqVP75D8KJfsSK",
    lstFeeTokenAccount: "uHitzjNurFmzTVcFTUuVXNnZihA2qoz5RgUk1kcC1s7",
    lstMint: "strng7mqqc1MBJJV6vMzYbEqnwVGvKKGKedeCvtktWA",
    start: "2024-07-25",
    methodology: {
      Fees: "Staking rewards from staked SOL on Stronghold staked solana",
      Revenue: "Includes withdrawal fees and management fees collected by fee collector",
      ProtocolRevenue: "Revenue going to treasury/team",
    },
  }),

  "thevault": simpleConfig({
    stakePoolReserveAccount: "CCavXvmMgfW4Ky2PX3E9Nij8TMxLmSsMZuHUtxXUL1aN",
    stakePoolWithdrawAuthority: "GdNXJobf8fbTR5JSE7adxa6niaygjx4EEbnnRaDCHMMW",
    lstFeeTokenAccount: "Bk2qhUpf3hHZWwpYSudZkbrkA9DVKrNNhQfnH7zF67Ji",
    lstMint: (ADDRESSES.solana as any).VSOL,
    start: "2024-05-02",
    revenue: { type: "addCGToken", cgId: "the-vault-staked-sol" },
    methodology: {
      Fees: "staking yield rewards generated by the vault",
      Revenue: "Includes 0.1% fee for delayed unstaking, 5% fee on staking rewards and a 0.1% fee applies when burning LST tokens created through the LST Creator program",
      ProtocolRevenue: "Includes 0.1% fee for delayed unstaking, 5% fee on staking rewards and a 0.1% fee applies when burning LST tokens created through the LST Creator program",
    },
  }),
};

// --- Special handling for doublezero and jito ---

// doublezero-staked-sol: has a conditional revenue cgId based on timestamp
// We need to override the generated fetch to handle this
const doublezeroOriginalConfig = configs["doublezero-staked-sol"];
const doublezeroAdapter = (() => {
  const baseCfg = { ...doublezeroOriginalConfig };

  const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const revenueToken = options.startTimestamp > 1759735276 ? "doublezero-staked-sol" : "solana";

    const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
      start: options.startTimestamp,
      end: options.endTimestamp,
      stake_pool_reserve_account: baseCfg.stakePoolReserveAccount,
      stake_pool_withdraw_authority: baseCfg.stakePoolWithdrawAuthority,
      lst_fee_token_account: baseCfg.lstFeeTokenAccount,
      lst_mint: baseCfg.lstMint,
    });

    const results = await queryDuneSql(options, query);

    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();

    results.forEach((row: any) => {
      if (row.metric_type === "dailyFees") {
        dailyFees.addCGToken("solana", row.amount || 0);
      } else if (row.metric_type === "dailyRevenue") {
        dailyRevenue.addCGToken(revenueToken, row.amount || 0);
      }
    });

    return {
      dailyFees,
      dailyRevenue,
      dailyProtocolRevenue: dailyRevenue,
      dailyHoldersRevenue: 0,
    };
  };

  const adapter: SimpleAdapter = {
    version: 1,
    methodology: baseCfg.methodology,
    fetch,
    dependencies: [Dependencies.DUNE],
    chains: [CHAIN.SOLANA],
    start: baseCfg.start,
    isExpensiveAdapter: true,
  };

  return adapter;
})();

// jito-staked-sol: has commented-out revenue logic, only returns dailyFees + dailySupplySideRevenue
/* const jitoAdapter = (() => {
  const cfg = configs["jito-staked-sol"];

  const fetch = async (_a: any, _b: any, options: FetchOptions) => {
    const query = getSqlFromFile("helpers/queries/sol-lst.sql", {
      start: options.startTimestamp,
      end: options.endTimestamp,
      stake_pool_reserve_account: cfg.stakePoolReserveAccount,
      stake_pool_withdraw_authority: cfg.stakePoolWithdrawAuthority,
      lst_fee_token_account: cfg.lstFeeTokenAccount,
      lst_mint: cfg.lstMint,
    });

    const results = await queryDuneSql(options, query);

    const dailyFees = options.createBalances();
    // const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();

    results.forEach((row: any) => {
      if (row.metric_type === "dailyFees") {
        dailyFees.addCGToken("solana", row.amount || 0, METRIC.STAKING_REWARDS);
        dailySupplySideRevenue.addCGToken("solana", Number(row.amount) * 0.96 || 0, METRIC.STAKING_REWARDS);
      // } else if (row.metric_type === 'dailyRevenue') {
      //   dailyRevenue.addCGToken("jito-staked-sol", row.amount || 0);
      }
    });

    return {
      dailyFees,
      dailySupplySideRevenue,
      // dailyRevenue,
      // dailyProtocolRevenue: dailyRevenue,
      // dailyHoldersRevenue: 0,
    };
  };

  const adapter: SimpleAdapter = {
    version: 1,
    methodology: cfg.methodology,
    fetch,
    chains: [CHAIN.SOLANA],
    start: cfg.start,
    dependencies: [Dependencies.DUNE],
    isExpensiveAdapter: true,
    breakdownMethodology: cfg.breakdownMethodology,
  };

  return adapter;
})();
 */
// --- Build all adapters ---

const protocols: Record<string, SimpleAdapter> = {};

for (const [name, config] of Object.entries(configs)) {
  // Skip adapters with custom implementations
  if (name === "doublezero-staked-sol" || name === "jito-staked-sol") continue;
  protocols[name] = createSolLstAdapter(config);
}

// Add custom adapters
protocols["doublezero-staked-sol"] = doublezeroAdapter;
// protocols["jito-staked-sol"] = jitoAdapter;

// Export factory interface
const { protocolList, getAdapter } = createFactoryExports(protocols);
export { protocolList, getAdapter };
