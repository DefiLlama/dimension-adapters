/**
 * Katana V3 Fee Structure
 * Source: https://docs.roninchain.com/apps/katana/swap-tokens
 * 
 * Fee tiers and breakdown:
 * 1. 0.01% - Stablecoin pairs
 *    - 0.005% LP fee
 *    - 0.005% Ronin Treasury fee
 * 
 * 2. 0.3% - Most trading pairs
 *    - 0.25% LP fee
 *    - 0.05% Ronin Treasury fee
 * 
 * 3. 1% - High-volatility pairs
 *    - 0.85% LP fee
 *    - 0.15% Ronin Treasury fee
 */

import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { request } from "graphql-request";

const graphUrl = "https://thegraph-v2.roninchain.com/subgraphs/name/axieinfinity/katana-v3";

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const totalFees = options.createBalances();
  const totalRevenue = options.createBalances();
  const totalSupplySideRevenue = options.createBalances();

  const endBlock = await options.getEndBlock();
  const startBlock = await options.getStartBlock();

  const query = `
    query getTotalFees($block: Int!) {
      pools(where: {feesUSD_gt: "0"}, first: 1000, block: { number: $block }) {
        feeTier
        feesUSD
      }
    }
  `;

  const [startResult, endResult] = await Promise.all([
    request(graphUrl, query, { block: startBlock }),
    request(graphUrl, query, { block: endBlock })
  ]);

  const calculateFees = (pool: any) => {
    const feeTier = Number(pool.feeTier);
    const totalFees = Number(pool.feesUSD);
    let lpFeeShare = 0;
    let protocolFeeShare = 0;

    switch (feeTier) {
      case 100: // 0.01%
        lpFeeShare = 0.5; // 0.005%
        protocolFeeShare = 0.5; // 0.005%
        break;
      case 3000: // 0.3%
        lpFeeShare = 0.833333; // 0.25%
        protocolFeeShare = 0.166667; // 0.05%
        break;
      case 10000: // 1%
        lpFeeShare = 0.85; // 0.85%
        protocolFeeShare = 0.15; // 0.15%
        break;
      default:
        lpFeeShare = 0.833333; // Default to standard 0.3% pool ratios
        protocolFeeShare = 0.166667;
    }

    return {
      lpFees: totalFees * lpFeeShare,
      protocolFees: totalFees * protocolFeeShare
    };
  };

  const startFees = startResult.pools.reduce((acc: any, pool: any) => {
    const fees = calculateFees(pool);
    return {
      lpFees: acc.lpFees + fees.lpFees,
      protocolFees: acc.protocolFees + fees.protocolFees
    };
  }, { lpFees: 0, protocolFees: 0 });

  const endFees = endResult.pools.reduce((acc: any, pool: any) => {
    const fees = calculateFees(pool);
    return {
      lpFees: acc.lpFees + fees.lpFees,
      protocolFees: acc.protocolFees + fees.protocolFees
    };
  }, { lpFees: 0, protocolFees: 0 });

  const dailyLpFees = endFees.lpFees - startFees.lpFees;
  const dailyProtocolFees = endFees.protocolFees - startFees.protocolFees;

  dailySupplySideRevenue.addUSDValue(dailyLpFees);
  dailyRevenue.addUSDValue(dailyProtocolFees);
  dailyFees.addUSDValue(dailyLpFees + dailyProtocolFees);

  // Add total metrics
  totalSupplySideRevenue.addUSDValue(endFees.lpFees);
  totalRevenue.addUSDValue(endFees.protocolFees);
  totalFees.addUSDValue(endFees.lpFees + endFees.protocolFees);

  return {
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyUserFees: dailyFees,
    totalFees,
    totalRevenue,
    totalSupplySideRevenue,
    totalUserFees: totalFees,
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.RONIN]: {
      fetch,
      start: "2024-11-26",
      meta: {
        methodology: {
          Fees: "Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools.",
          Revenue: "Protocol fees collected by Katana - 0.05% of each trade for most pools",
          SupplySideRevenue: "Fees distributed to LPs - 0.25% of each trade for most pools",
          UserFees: "Same as Fees - total trading fees paid by users",
          totalFees: "Cumulative sum of all trading fees since protocol inception",
          totalRevenue: "Cumulative sum of protocol fees collected by Katana since inception",
          totalSupplySideRevenue: "Cumulative sum of fees distributed to LPs since protocol inception",
          totalUserFees: "Cumulative sum of all user-paid trading fees since protocol inception"
        }
      }
    }
  },
};

export default adapter;
