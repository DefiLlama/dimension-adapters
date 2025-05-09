/**
 * Dackieswap V3 Fee Structure
 * Source: https://docs.dackieswap.xyz/products/product-features/traders/trading-fee
 * 
 * Fee tiers and breakdown:
 * 1. 0.01% - Stablecoin pairs
 *    - 0.0067% LP fee
 *    - 0.0033% Protocol fee
 * 
 * 2. 0.05% - Most trading pairs
 *    - 0.0335% LP fee
 *    - 0.0165% Protocol fee
 * 
 * 3. 0.25% - Most trading pairs
 *    - 0.17% LP fee
 *    - 0.08% Protocol fee
 * 
 * 4. 1% - High-volatility pairs
 *    - 0.67% LP fee
 *    - 0.33% Protocol fee
 */

import { SimpleAdapter, FetchOptions } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { request } from "graphql-request";
import { v3StartTimes } from "../dexs/dackieswap";

const methodology = {
  Fees: "Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools.",
  Revenue: "Protocol fees collected by DackiSwap - 0.05% of each trade for most pools",
  SupplySideRevenue: "Fees distributed to LPs - 0.25% of each trade for most pools",
  UserFees: "Same as Fees - total trading fees paid by users",
  totalFees: "Cumulative sum of all trading fees since protocol inception",
  totalRevenue: "Cumulative sum of protocol fees collected by DackiSwap since inception",
  totalSupplySideRevenue: "Cumulative sum of fees distributed to LPs since protocol inception",
  totalUserFees: "Cumulative sum of all user-paid trading fees since protocol inception"
}

const v3Endpoint: any = {
  [CHAIN.BASE]:
    "https://api.studio.thegraph.com/query/50473/v3-base/version/latest",
  [CHAIN.OPTIMISM]:
    "https://api.studio.thegraph.com/query/50473/v3-optimism/version/latest",
  [CHAIN.ARBITRUM]:
      "https://api.studio.thegraph.com/query/50473/v3-arbitrum/version/latest",
  [CHAIN.BLAST]:
      "https://api.studio.thegraph.com/query/50473/v3-blast/version/latest",
  [CHAIN.MODE]:
      "https://api.studio.thegraph.com/query/50473/v3-mode/version/latest",
  [CHAIN.XLAYER]:
      "https://api.studio.thegraph.com/query/50473/v3-xlayer/version/latest",
  [CHAIN.LINEA]:
      "https://api.studio.thegraph.com/query/50473/v3-linea/version/latest",
};

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
    request(v3Endpoint[options.chain], query, { block: startBlock }),
    request(v3Endpoint[options.chain], query, { block: endBlock })
  ]);

  const calculateFees = (pool: any) => {
    const feeTier = Number(pool.feeTier);
    const totalFees = Number(pool.feesUSD);
    let lpFeeShare = 0;
    let protocolFeeShare = 0;

    switch (feeTier) {
      case 100: // 0.01%
        lpFeeShare = 0.67; // 0.0067%
        protocolFeeShare = 0.33; // 0.0033%
        break;
      case 500: // 0.05%
        lpFeeShare = 0.67; // 0.0335%
        protocolFeeShare = 0.33; // 0.0165%
        break;
      case 2500: // 0.25%
        lpFeeShare = 0.68; // 0.17%
        protocolFeeShare = 0.32; // 0.08%
        break;
      case 10000: // 1%
        lpFeeShare = 0.67; // 0.67%
        protocolFeeShare = 0.33; // 0.33%
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
    [CHAIN.BASE]: {
      fetch,
      start: v3StartTimes[CHAIN.BASE],
      meta: {
        methodology,
      }
    },
    [CHAIN.OPTIMISM]: {
      fetch,
      start: v3StartTimes[CHAIN.OPTIMISM],
      meta: {
        methodology,
      }
    },
    [CHAIN.BLAST]: {
      fetch,
      start: v3StartTimes[CHAIN.BLAST],
      meta: {
        methodology,
      }
    },
    [CHAIN.MODE]: {
      fetch,
      start: v3StartTimes[CHAIN.MODE],
      meta: {
        methodology,
      }
    },
    [CHAIN.XLAYER]: {
      fetch,
      start: v3StartTimes[CHAIN.XLAYER],
      meta: {
        methodology,
      }
    },
    [CHAIN.LINEA]: {
      fetch,
      start: v3StartTimes[CHAIN.LINEA],
      meta: {
        methodology,
      }
    },
  },
};

export default adapter;
