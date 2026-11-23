import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { getSolanaReceived } from "../helpers/token";
import { METRIC } from "../helpers/metrics";

// https://metabase.definitive.fi/public/dashboard/80e43551-a7e9-4503-8ac5-d5697a4a3734?tab=17-revenue

const BUYBACK_START_DATE = '2025-10-01';

// Solana addresses for legacy fee collection
const SOLANA_FEE_ADDRESSES = [
  "Ggp9SGTqAKiJWRXeyEb2gEVdmD6n7fgHD7t4s8DrAqwf",
];

// Solana addresses to blacklist (exclude from fee calculation)
const SOLANA_BLACKLIST = [
  "BQ72nSv9f3PRyRKCBnHLVrerrv37CYTHm5h3s9VSGQDV", // Jupiter Aggregator Authority 1
  "ByRijnGjExGxNcidASSZcySmrvnB5NwgVK3QQacWXXvM", 
  "9XLonXfbZqBp66WRDScfRp1MJYKd4k4tUDibMQBLJehJ", 
  "CapuXNQoDviLvU1PxFiizLgPNQCxrsag1uMeyk6zLVps", // Jupiter Aggregator Authority 6
  "5Dr7kc6U9hrwv1PQz67nyvhUpvXdQibt6L8RHwUrt2L4", 
  "A1GC8eqyezWb5gbgaLxzg93LgP84SXhLZymmv7g4t87a",
];

const prefetch = async (options: FetchOptions) => {
  const sql = getSqlFromFile("helpers/queries/definitive.sql", {
    start: options.startTimestamp,
    end: options.endTimestamp,
    collector: '0xa2fe8E38A14CF7BeECE22aE71E951F78CE233643'
  });
  return await queryDuneSql(options, sql);
}

// Map DefiLlama chain names to Dune blockchain names
const CHAIN_TO_DUNE_MAPPING: Record<string, string> = {
  [CHAIN.ETHEREUM]: 'ethereum',
  [CHAIN.ARBITRUM]: 'arbitrum', 
  [CHAIN.BASE]: 'base',
  [CHAIN.POLYGON]: 'polygon',
  [CHAIN.AVAX]: 'avalanche_c',
  [CHAIN.OPTIMISM]: 'optimism',
  [CHAIN.BSC]: 'bnb',
  [CHAIN.ROBINHOOD]: 'robinhood',
  [CHAIN.INK]: 'ink',
  [CHAIN.ARC]: 'arc',
};

const chainConfig = {
  [CHAIN.ETHEREUM]: { start: '2022-01-01' },
  [CHAIN.ARBITRUM]: { start: '2022-01-01' },
  [CHAIN.BASE]: { start: '2022-01-01' },
  [CHAIN.POLYGON]: { start: '2022-01-01' },
  [CHAIN.AVAX]: { start: '2022-01-01' },
  [CHAIN.OPTIMISM]: { start: '2022-01-01' },
  [CHAIN.BSC]: { start: '2022-01-01' },
  [CHAIN.ROBINHOOD]: { start: '2026-07-11' },
  [CHAIN.INK]: { start: '2026-09-08' },
  [CHAIN.ARC]: { start: '2026-09-15' },
  [CHAIN.SOLANA]: { start: '2022-01-01' },
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Handle Solana separately with the original logic
  if (options.chain === CHAIN.SOLANA) {
    const solanaFees = await getSolanaReceived({
      options,
      targets: SOLANA_FEE_ADDRESSES,
      blacklists: SOLANA_BLACKLIST,
    });

    dailyFees.addBalances(solanaFees, METRIC.TRADING_FEES);
  } else {
    // Handle EVM chains with Dune query
    const preFetchedResults = options.preFetchedResults || [];
    const dune_chain = CHAIN_TO_DUNE_MAPPING[options.chain];

    if (!dune_chain) {
      console.log(`No Dune mapping found for chain ${options.chain}`);
    } else {
      const data = preFetchedResults.find((result: any) => result.blockchain === dune_chain);

      if (data) {
        const usdcFees = data.total_amount_usdc || 0;
        dailyFees.addUSDValue(usdcFees, METRIC.TRADING_FEES);
      } else {
        console.log(`No data found for chain ${options.chain} on ${options.startOfDay}`);
      }
    }
  }

  // From October 1, 2025, 10% of revenue funds EDGE buybacks and 10% funds EDGE staker rewards.
  // https://docs.definitive.fi/edge/buybacks-and-rewards
  const holdersRevenueShare = options.dateString >= BUYBACK_START_DATE ? 0.2 : 0;
  const dailyHoldersRevenue = dailyFees.clone(holdersRevenueShare / 2, METRIC.TOKEN_BUY_BACK);
  dailyHoldersRevenue.addBalances(dailyFees.clone(holdersRevenueShare / 2, METRIC.STAKING_REWARDS));

  return {
    dailyFees,
    dailyUserFees: dailyFees.clone(),
    dailyRevenue: dailyFees.clone(),
    dailyProtocolRevenue: dailyFees.clone(1 - holdersRevenueShare),
    dailyHoldersRevenue,
  }
}

const methodology = {
  Fees: 'User pays 0.25% - 0.85% fee on each trade. Majors and Stables have feeless trading.',
  UserFees: 'User pays 0.25% - 0.85% fee on each trade',
  Revenue: 'Trading fees are split between Definitive and EDGE holders',
  ProtocolRevenue: '100% of revenue is allocated to Definitive before October 1, 2025, and 80% thereafter',
  HoldersRevenue: 'From October 1, 2025, 10% of revenue funds EDGE buybacks and 10% funds EDGE staker rewards',
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Trading fees (0.25%-0.85% per trade) collected at Definitive fee addresses. Majors and Stables have feeless trading.',
  },
  UserFees: {
    [METRIC.TRADING_FEES]: 'Trading fees (0.25%-0.85% per trade) paid by users. Majors and Stables have feeless trading.',
  },
  Revenue: {
    [METRIC.TRADING_FEES]: 'Trading fees split between Definitive and EDGE holders',
  },
  ProtocolRevenue: {
    [METRIC.TRADING_FEES]: '100% of trading fee revenue is allocated to Definitive before October 1, 2025, and 80% thereafter',
  },
  HoldersRevenue: {
    [METRIC.TOKEN_BUY_BACK]: '10% of trading fee revenue funds EDGE buybacks from October 1, 2025',
    [METRIC.STAKING_REWARDS]: '10% of trading fee revenue funds EDGE staker rewards from October 1, 2025',
  },
}

const adapter: Adapter = {
  fetch,
  adapter: chainConfig,
  prefetch,
  dependencies: [Dependencies.DUNE, Dependencies.ALLIUM],
  methodology,
  breakdownMethodology,
  isExpensiveAdapter: true,
};

export default adapter;
