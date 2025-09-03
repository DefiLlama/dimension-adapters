import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { getSolanaReceived } from "../helpers/token";

// https://metabase.definitive.fi/public/dashboard/80e43551-a7e9-4503-8ac5-d5697a4a3734?tab=17-revenue

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
};

const chainConfig = {
  [CHAIN.ETHEREUM]: { start: '2022-01-01' },
  [CHAIN.ARBITRUM]: { start: '2022-01-01' },
  [CHAIN.BASE]: { start: '2022-01-01' },
  [CHAIN.POLYGON]: { start: '2022-01-01' },
  [CHAIN.AVAX]: { start: '2022-01-01' },
  [CHAIN.OPTIMISM]: { start: '2022-01-01' },
  [CHAIN.BSC]: { start: '2022-01-01' },
  [CHAIN.SOLANA]: { start: '2022-01-01' },
}

const fetch = async (_a: any, _ts: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Handle Solana separately with the original logic
  if (options.chain === CHAIN.SOLANA) {
    const solanaFees = await getSolanaReceived({
      options,
      targets: SOLANA_FEE_ADDRESSES,
      blacklists: SOLANA_BLACKLIST,
    });
    
    return {
      dailyFees: solanaFees,
      dailyUserFees: solanaFees,
      dailyRevenue: solanaFees,
      dailyProtocolRevenue: solanaFees,
    };
  }

  // Handle EVM chains with Dune query
  const preFetchedResults = options.preFetchedResults || [];
  const dune_chain = CHAIN_TO_DUNE_MAPPING[options.chain];
  
  if (!dune_chain) {
    console.log(`No Dune mapping found for chain ${options.chain}`);
    return {
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue: dailyFees,
      dailyProtocolRevenue: dailyFees,
    };
  }
  
  const data = preFetchedResults.find((result: any) => result.blockchain === dune_chain);

  if (data) {
    const usdcFees = data.total_amount_usdc || 0;
    dailyFees.addUSDValue(usdcFees);
  } else { 
    console.log(`No data found for chain ${options.chain} on ${options.startOfDay}`);
  }

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: dailyFees,
    dailyProtocolRevenue: dailyFees,
  }
}

const methodology = {
  Fees: 'User pays 0.05% - 0.25% fee on each trade',
  UserFees: 'User pays 0.05% - 0.25% fee on each trade',
  Revenue: 'Fees are distributed to Definitive',
  ProtocolRevenue: 'Fees are distributed to Definitive',
}

const adapter: Adapter = {
  fetch,
  adapter: chainConfig,
  methodology,
  prefetch,
  isExpensiveAdapter: true,
};

export default adapter;
