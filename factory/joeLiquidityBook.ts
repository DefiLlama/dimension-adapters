/**
 * Trader Joe Liquidity Book Factory
 *
 * Generates DEX/fees adapters for protocols that use the Trader Joe
 * Liquidity Book (LB) AMM. All adapters share the same on-chain log
 * parsing logic from helpers/joe.ts (joeLiquidityBookExport) but differ in:
 *   - Factory contract addresses and LB version (2, 2.1, 2.2)
 *   - Chains supported
 *   - Fee revenue distribution (holdersRevenueFromRevenue, protocolRevenueFromRevenue)
 *   - Methodology text
 *   - Start dates per chain
 *
 * Protocols covered:
 *   - traderjoe-lb-v2-2 (dexs + fees)
 *   - traderjoe-v2 (dexs only)
 *   - joe-v2.1 (dexs + fees)
 *   - merchant-moe-liquidity-book (dexs only)
 *   - hyperbrick (dexs only)
 */

import { SimpleAdapter } from "../adapters/types";
import { joeLiquidityBookExport } from "../helpers/joe";
import { CHAIN } from "../helpers/chains";
import { createFactoryExports } from "./registry";

interface JoeLBProtocolConfig {
  /** Config passed to joeLiquidityBookExport first argument */
  exportConfig: Parameters<typeof joeLiquidityBookExport>[0];
  /** Optional fees config passed as second argument */
  feesConfig?: Parameters<typeof joeLiquidityBookExport>[1];
  /** Methodology object spread onto the adapter */
  methodology: Record<string, string>;
}

const configs: Record<string, JoeLBProtocolConfig> = {
  "traderjoe-lb-v2-2": {
    exportConfig: {
      [CHAIN.AVAX]: {
        factories: [
          {
            factory: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
            version: 2.2 as any,
            fromBlock: 46536129,
          },
        ]
      },
      [CHAIN.ARBITRUM]: {
        factories: [
          {
            factory: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
            version: 2.2 as any,
            fromBlock: 220345864,
          },
        ]
      },
      [CHAIN.MONAD]: {
        factories: [
          {
            factory: '0xb43120c4745967fa9b93E79C149E66B0f2D6Fe0c',
            version: 2.2 as any,
            fromBlock: 32250766,
          },
        ]
      },
    },
    feesConfig: {
      holdersRevenueFromRevenue: 1, // 100% revenue
    },
    methodology: {
      Fees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
      UserFees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
      Revenue: 'Share of amount of swap fees.',
      ProtocolRevenue: 'No protocol fees.',
      HoldersRevenue: 'All revenue distributed to sJOE stakers',
    },
  },

  "traderjoe-v2": {
    exportConfig: {
      [CHAIN.AVAX]: {
        factories: [
          {
            factory: '0x6E77932A92582f504FF6c4BdbCef7Da6c198aEEf',
            version: 2 as any,
            fromBlock: 22426953,
          },
        ]
      },
      [CHAIN.ARBITRUM]: {
        factories: [
          {
            factory: '0x1886D09C9Ade0c5DB822D85D21678Db67B6c2982',
            version: 2 as any,
            fromBlock: 47891979,
          },
        ]
      },
      [CHAIN.BSC]: {
        factories: [
          {
            factory: '0x43646A8e839B2f2766392C1BF8f60F6e587B6960',
            version: 2 as any,
            fromBlock: 26153438,
          },
        ]
      },
    },
    feesConfig: {
      holdersRevenueFromRevenue: 1, // 100% revenue
    },
    methodology: {
      Fees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
      UserFees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
      Revenue: 'Share of amount of swap fees.',
      ProtocolRevenue: 'No protocol fees.',
      HoldersRevenue: 'All revenue distributed to sJOE stakers',
    },
  },

  "joe-v2.1": {
    exportConfig: {
      [CHAIN.AVAX]: {
        factories: [
          {
            factory: '0x8e42f2F4101563bF679975178e880FD87d3eFd4e',
            version: 2.1 as any,
            fromBlock: 28371397,
          },
        ]
      },
      [CHAIN.ARBITRUM]: {
        factories: [
          {
            factory: '0x8e42f2F4101563bF679975178e880FD87d3eFd4e',
            version: 2.1 as any,
            fromBlock: 77473199,
          },
        ]
      },
      [CHAIN.BSC]: {
        factories: [
          {
            factory: '0x8e42f2F4101563bF679975178e880FD87d3eFd4e',
            version: 2.1 as any,
            fromBlock: 27099340,
          },
        ]
      },
      [CHAIN.ETHEREUM]: {
        factories: [
          {
            factory: '0xDC8d77b69155c7E68A95a4fb0f06a71FF90B943a',
            version: 2.1 as any,
            fromBlock: 17821282,
          },
        ]
      },
      [CHAIN.MONAD]: {
        factories: [
          {
            factory: '0xe32D45C2B1c17a0fE0De76f1ebFA7c44B7810034',
            version: 2.1 as any,
            fromBlock: 32248561,
          },
        ],
        start: "2025-10-29"
      },
    },
    feesConfig: {
      holdersRevenueFromRevenue: 1, // 100% revenue
    },
    methodology: {
      Fees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
      UserFees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
      Revenue: 'Share of amount of swap fees.',
      ProtocolRevenue: 'No protocol fees.',
      HoldersRevenue: 'All revenue distributed to sJOE stakers',
    },
  },

  "merchant-moe-liquidity-book": {
    exportConfig: {
      [CHAIN.MANTLE]: {
        factories: [
          {
            factory: '0xa6630671775c4EA2743840F9A5016dCf2A104054',
            version: 2.2 as any,
            fromBlock: 61742960,
          },
        ]
      },
    },
    feesConfig: {
      holdersRevenueFromRevenue: 1, // 100% revenue
    },
    methodology: {
      Fees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
      UserFees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
      Revenue: 'Share of amount of swap fees.',
      ProtocolRevenue: 'No protocol fees.',
      HoldersRevenue: 'All revenue distributed to MOE stakers.',
    },
  },

  "hyperbrick": {
    exportConfig: {
      [CHAIN.HYPERLIQUID]: {
        factories: [
          {
            factory: '0x4A1EFb00B4Ad1751FC870C6125d917C3f1586600',
            version: 2.2 as any,
            fromBlock: 9069569,
          },
        ]
      },
    },
    methodology: {
      Fees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
      UserFees: 'Total swap fees typically range from 0.01% up to 0.8% of the total amount paid by users.',
      Revenue: 'Share of amount of swap fees.',
    },
  },
};

function buildAdapter(config: JoeLBProtocolConfig): SimpleAdapter {
  const base = joeLiquidityBookExport(config.exportConfig, config.feesConfig);
  return {
    ...base,
    version: 2,
    pullHourly: true,
    methodology: config.methodology,
  } as SimpleAdapter;
}

// Build all protocol adapters
const protocols: Record<string, SimpleAdapter> = {};
for (const [name, config] of Object.entries(configs)) {
  protocols[name] = buildAdapter(config);
}

// Default export covers dexs (all protocols)
module.exports = createFactoryExports(protocols);
