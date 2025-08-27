import { Adapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getSqlFromFile, queryDuneSql } from "../helpers/dune";
import { getTimestampAtStartOfDayUTC } from "../utils/date";
import { getSolanaReceived } from "../helpers/token";

// https://metabase.definitive.fi/public/dashboard/80e43551-a7e9-4503-8ac5-d5697a4a3734?tab=17-revenue

// Solana addresses for legacy fee collection
const SOLANA_FEE_ADDRESSES = [
  "Ggp9SGTqAKiJWRXeyEb2gEVdmD6n7fgHD7t4s8DrAqwf",
];

const prefetch = async (options: FetchOptions) => {
  const startOfDay = getTimestampAtStartOfDayUTC(options.startOfDay);
  const sql = getSqlFromFile("helpers/queries/definitive.sql", {
    start: startOfDay
  });
  return await queryDuneSql(options, sql);
}

const chainConfig = {
  [CHAIN.ETHEREUM]: { start: '2022-01-01' },
  [CHAIN.ARBITRUM]: { start: '2022-01-01' },
  [CHAIN.BASE]: { start: '2022-01-01' },
  [CHAIN.POLYGON]: { start: '2022-01-01' },
  [CHAIN.AVAX]: { start: '2022-01-01' },
  [CHAIN.SOLANA]: { start: '2022-01-01' },
}

const fetch = async (_a: any, _ts: any, options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // Handle Solana separately with the original logic
  if (options.chain === CHAIN.SOLANA) {
    const solanaFees = await getSolanaReceived({
      options,
      targets: SOLANA_FEE_ADDRESSES,
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
  const dune_chain = options.chain === CHAIN.AVAX ? 'avalanche_c' : options.chain;
  const data = preFetchedResults.find((result: any) => result.blockchain === dune_chain);

  if (data) {
    // The SQL query returns total_amount_usdc which is already in USD
    const usdcFees = data.total_amount_usdc || 0;
    
    console.log(`${options.chain}: Found ${data.tx_count} transactions, ${usdcFees} USD in fees`);
    
    // Add USDC fees as USD value
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
