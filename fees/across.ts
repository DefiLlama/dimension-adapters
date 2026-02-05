/**
 * Across Adapter
 * 
 * NOTE: This implementation uses Dune queries rather than event-based calculations.
 * 
 * Previous event-based methods had bugs because:
 * 1. Events don't provide enough data points to accurately estimate fees
 * 2. Simple inputAmount-outputAmount calculations are incorrect as token amounts 
 *    have different decimal precision across chains
 * 3. Cross-chain token swaps (e.g., ETH from Arbitrum to USDC on Base) 
 *    complicates fee calculations
 * 
 * This Dune-based approach provides more accurate fee calculations by directly 
 * querying processed cross-chain transfer data.
 */

import { Adapter, Dependencies, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { queryDuneSql } from "../helpers/dune";

interface IResponse {
  dst_chain: string;
  relay_fees: number;
  lp_fees: number;
}

// Prefetch function that will run once before any fetch calls
const prefetch = async (options: FetchOptions) => {
  return queryDuneSql(options, `
    SELECT
        dst_chain
        , SUM(relay_fee_in_usd) as relay_fees
        , SUM(lp_fee_in_usd) as lp_fees
    FROM dune.risk_labs.result_across_transfers_foundation
    WHERE relay_fee_in_usd is not null
      AND block_time >= from_unixtime(${options.startTimestamp})
      AND block_time < from_unixtime(${options.endTimestamp})
    GROUP BY dst_chain
  `);
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const results: IResponse[] = options.preFetchedResults || [];
  const chainData = results.find(item => item.dst_chain === options.chain);

  const dailyFees = (chainData?.relay_fees || 0) + (chainData?.lp_fees || 0);

  return {
    dailyFees,
    dailyUserFees: dailyFees,
    dailyRevenue: 0,
    dailyProtocolRevenue: 0,
    dailySupplySideRevenue: dailyFees,
  }
}

const methodology = {
  Fees: "Total fees paid by users for bridge txs.",
  Revenue: "Protocol revenue is 0.",
  dailyProtocolRevenue: "Across takes 0% fees paid by users.",
  SupplySideRevenue: "Total fees paid by users are distributed to liquidity providers and relayers.",
}

const adapter: Adapter = {
  version: 1,
  dependencies: [Dependencies.DUNE],
  adapter: {
    [CHAIN.ETHEREUM]: { fetch, start: "2021-11-03" },
    [CHAIN.ARBITRUM]: { fetch, start: "2022-05-24" },
    [CHAIN.OPTIMISM]: { fetch, start: "2022-05-10" },
    [CHAIN.BOBA]: {fetch, start: "2022-05-05"},
    [CHAIN.POLYGON]: { fetch, start: "2022-05-10" },
    [CHAIN.ZKSYNC]: { fetch, start: "2023-08-10" },
    [CHAIN.BASE]: { fetch, start: "2023-08-22" },
    [CHAIN.LINEA]: { fetch, start: "2024-03-20" },
    [CHAIN.BLAST]: { fetch, start: "2024-07-10" },
    [CHAIN.SCROLL]: {fetch, start: "2024-07-31"},
    [CHAIN.ZORA]: {fetch, start: "2024-08-15"},
    [CHAIN.WC]: {fetch, start: "2024-10-10"},
    [CHAIN.INK]: {fetch, start: "2025-01-02"},
    [CHAIN.UNICHAIN]: { fetch, start: "2025-02-06" },
    [CHAIN.LENS]: { fetch, start: "2025-03-28" },
    [CHAIN.SOLANA]: { fetch, start: "2025-04-14" },
    [CHAIN.BSC]: { fetch, start: "2025-05-03" },
  },
  prefetch,
  methodology,
  allowNegativeValue: true, // Gas Fee cost be higher than estimated
  isExpensiveAdapter: true,
};

export default adapter;
