import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getGraphDimensions2 } from "../helpers/getUniSubgraph";

const config = {
  graphUrls: {
    [CHAIN.BERACHAIN]: "https://api.goldsky.com/api/public/project_clpx84oel0al201r78jsl0r3i/subgraphs/kodiak-v3-berachain-mainnet/latest/gn",
  },
  totalVolume: { factory: "factories", field: "totalVolumeUSD" },
}

const adapter: SimpleAdapter = {
  version: 2,
  chains: Object.keys(config.graphUrls),
  start: '2025-02-07',
  fetch: async (options: FetchOptions) => {
    const feesPercent = options.startOfDay >= 1767225600 ? {
      type: "fees",
      ProtocolRevenue: 35 * 0.1, // 10% revenue
      HoldersRevenue: 35 * 0.6, // 60% revenue
      UserFees: 100,
      SupplySideRevenue: 65 + 35 * 0.3, // 65% swap fees + 30% from revenue to Protocol-Owned Liquidity
      Revenue: 35,
    } : {
      type: "fees",
      ProtocolRevenue: 35,
      HoldersRevenue: 0,
      UserFees: 100,
      SupplySideRevenue: 65,
      Revenue: 35,
    }
    
    const graphFetch = getGraphDimensions2({
      graphUrls: config.graphUrls,
      totalVolume: config.totalVolume,
      feesPercent: feesPercent as any,
    });
    
    const result = await graphFetch(options);
    
    const dailyFees = options.createBalances();
    const dailyRevenue = options.createBalances();
    const dailySupplySideRevenue = options.createBalances();
    const dailyProtocolRevenue = options.createBalances();
    const dailyHoldersRevenue = options.createBalances();
    
    dailyFees.addUSDValue(result.dailyFees, 'Swap Fees');
    dailySupplySideRevenue.addUSDValue(Number(result.dailyFees) * 0.65, 'Swap Fees To LPs');
    dailyRevenue.addUSDValue(Number(result.dailyFees) * 0.35, 'Swap Fees Collected As Revenue');
    
    if (options.startOfDay >= 1767225600) {
      dailySupplySideRevenue.addUSDValue(Number(result.dailyFees) * 0.35 * 0.3, 'Swap Fees To Protocol-Owned Liquidity');
      dailyProtocolRevenue.addUSDValue(Number(result.dailyFees) * 0.35 * 0.1, 'Swap Fees To Protocol');
      dailyHoldersRevenue.addUSDValue(Number(result.dailyFees) * 0.35 * 0.6, 'Token Buy Back');
    } else {
      dailyProtocolRevenue.addUSDValue(Number(result.dailyFees) * 0.35, 'Swap Fees To Protocol');
    }
    
    return {
      dailyVolume: result.dailyVolume,
      dailyFees,
      dailyUserFees: dailyFees,
      dailyRevenue,
      dailySupplySideRevenue,
      dailyProtocolRevenue,
      dailyHoldersRevenue,
    }
  },
  methodology: {
    Fees: 'Swap fees paid by users.',
    UserFees: 'Swap fees paid by users.',
    Revenue: 'There are 35% swap fees are collected as revenue.',
    SupplySideRevenue: 'There are 65% swap fees are collected as revenue + 30% of revenue share to Protocol-Owned Liquidity from 01-01-2026.',
    ProtocolRevenue: 'There are 10% revenue collected by Kodiak protocol, it was 100% before 01-01-2026.',
    HoldersRevenue: 'From 01-01-2026, there are 60% revenue are used to by back $KDK.',
  },
  breakdownMethodology: {
    Fees: {
      'Swap Fees': 'Swap fees paid by users.',
    },
    SupplySideRevenue: {
      'Swap Fees To LPs': 'Share of 65% swap fees to LPs.',
      'Swap Fees To Protocol-Owned Liquidity': '30% of revenue to Protocol-Owned Liquidity.',
    },
    Revenue: {
      'Swap Fees Collected As Revenue': 'There are 35% swap fees are collected as revenue.',
    },
    HoldersRevenue: {
      'Token Buy Back': 'From 01-01-2026, there are 60% revenue are used to by back $KDK.',
    },
  }
};

export default adapter;
