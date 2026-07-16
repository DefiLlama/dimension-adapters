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
 *   - hoodit (dexs + fees)
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
            factory: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1',
            version: 2.2 as any,
            fromBlock: 46536129,
          },
        ]
      },
      [CHAIN.ARBITRUM]: {
        factories: [
          {
            factory: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1',
            version: 2.2 as any,
            fromBlock: 220345864,
          },
        ]
      },
      [CHAIN.MONAD]: {
        factories: [
          {
            factory: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1',
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
            factory: '0x3211d27a1A1B8E40C7974F6951935303e6e56DBE',
            version: 2 as any,
            fromBlock: 22426953,
          },
        ]
      },
      [CHAIN.ARBITRUM]: {
        factories: [
          {
            factory: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1',
            version: 2 as any,
            fromBlock: 47891979,
          },
        ]
      },
      [CHAIN.BSC]: {
        factories: [
          {
            factory: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1',
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
            factory: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1',
            version: 2.1 as any,
            fromBlock: 28371397,
          },
        ]
      },
      [CHAIN.ARBITRUM]: {
        factories: [
          {
            factory: '0x3211d27a1A1B8E40C7974F6951935303e6e56DBE',
            version: 2.1 as any,
            fromBlock: 77473199,
          },
        ]
      },
      [CHAIN.BSC]: {
        factories: [
          {
            factory: '0x3211d27a1A1B8E40C7974F6951935303e6e56DBE',
            version: 2.1 as any,
            fromBlock: 27099340,
          },
        ]
      },
      [CHAIN.ETHEREUM]: {
        factories: [
          {
            factory: '0x3211d27a1A1B8E40C7974F6951935303e6e56DBE',
            version: 2.1 as any,
            fromBlock: 17821282,
          },
        ]
      },
      [CHAIN.MONAD]: {
        factories: [
          {
            factory: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1',
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
            factory: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1',
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

  "hoodit": {
    exportConfig: {
      [CHAIN.ROBINHOOD]: {
        factories: [
          {
            factory: '0x46531ea0E7cec64b14181d45F8C6798a1cE45da1',
            version: 2.2 as any,
            fromBlock: 7297329,
          },
        ],
        start: "2026-07-12",
      },
    },
    feesConfig: {
      protocolRevenueFromRevenue: 1, // protocol share accrues to the protocol treasury
    },
    methodology: {
      Fees: 'Total swap fees paid by users, typically 0.1% up to ~8% of swap amount depending on pool bin step and volatility.',
      UserFees: 'Total swap fees paid by users, typically 0.1% up to ~8% of swap amount depending on pool bin step and volatility.',
      Revenue: 'Protocol share (25%) of swap fees.',
      ProtocolRevenue: 'Protocol share (25%) of swap fees, collected by the protocol treasury.',
      SupplySideRevenue: 'Share of swap fees distributed to liquidity providers (75%).',
    },
  },

  "hyperbrick": {
    exportConfig: {
      [CHAIN.HYPERLIQUID]: {
        factories: [
          {
            factory: '0x3211d27a1A1B8E40C7974F6951935303e6e56DBE',
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
