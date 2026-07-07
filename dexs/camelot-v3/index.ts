import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getUniV3LogAdapter } from '../../helpers/uniswap';

// Camelot V3 uses Algebra (Uniswap V3-style concentrated liquidity)
// Fees are pool-specific and read on-chain from the Algebra pool configuration
// 85% for Liquidity Providers in LP tokens
// 7% redistributed to xGRAIL holders through Real Yield Staking plugin
// 3.5% dedicated to GRAIL buyback and burn
// 3% to the Operating expenses
// 1.5% to Algebra for licensing V3 AMM
// Source: https://docs.camelot.exchange/tokenomics/protocol-earnings
// Architecture: https://docs.camelot.exchange/protocol/amm-v3

const methodology = {
  Fees: 'Trading fees charged on swaps. Camelot V3 uses Algebra with dynamic fees.',
  UserFees: 'Users pay dynamic fees on each swap (typically 0.05% to 1%).',
  Revenue:
    'Portion of trading fees not paid to liquidity providers, totaling 15% of swap fees (10.5% to xGRAIL holders + buyback&burn, 4.5% to treasury and Algebra licensing).',
  ProtocolRevenue:
    '4.5% of trading fees go to the protocol (3% operating expenses + 1.5% Algebra V3 licensing).',
  HoldersRevenue:
    '10.5% of trading fees go to GRAIL/xGRAIL holders (7% via xGRAIL Real Yield Staking + 3.5% via GRAIL buyback & burn).',
  SupplySideRevenue: '85% of trading fees go to liquidity providers.',
};

const breakdownMethodology = {
  UserFees: {
    'Trading fees': 'Dynamic fees paid by users on each swap, typically ranging from 0.05% to 1% of trade volume depending on market conditions',
  },
  Fees: {
    'Trading fees': 'Total trading fees collected from all swaps on Camelot V3 pools using Algebra\'s dynamic fee model',
  },
  Revenue: {
    'Protocol fees': 'Combined protocol-controlled revenue (15% of trading fees) not paid to liquidity providers',
  },
  ProtocolRevenue: {
    'Protocol fees': 'Portion of trading fees allocated to the protocol, equal to 4.5% of total swap fees (3% operating expenses + 1.5% Algebra V3 AMM licensing)',
  },
  HoldersRevenue: {
    'Tokenholder fees': 'Portion of trading fees returned to GRAIL/xGRAIL holders, equal to 10.5% of total swap fees (7% via xGRAIL Real Yield Staking + 3.5% via GRAIL buyback & burn)',
  },
  SupplySideRevenue: {
    'LP fees': 'Portion of trading fees distributed to liquidity providers who supply capital to the pools, equal to 85% of total swap fees',
  },
};

const REVENUE_RATIO = 0.15; // 15% total protocol-controlled 
const USER_FEES_RATIO = 1; // Users pay 100% of fees
const PROTOCOL_REVENUE_RATIO = 0.045; // 4.5% protocol: 3% operating expenses + 1.5% Algebra licensing
const HOLDERS_REVENUE_RATIO = 0.105; // 10.5% holders: 7% xGRAIL Real Yield Staking + 3.5% GRAIL buyback & burn

const algebraPoolCreatedEvent =
  'event Pool (address indexed token0, address indexed token1, address pool)';

// Shared fee split
const baseConfig = {
  userFeesRatio: USER_FEES_RATIO,
  revenueRatio: REVENUE_RATIO,
  protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
  holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
};

// Most Camelot deployments use the original Algebra (v1.x) pools, where the
// swap fee is exposed via globalState() and the pool has no fee() method.
const adapterConfig = {
  ...baseConfig,
  isAlgebraV2: true,
  poolCreatedEvent: algebraPoolCreatedEvent,
};

// Plume runs newer Algebra Integral pools that expose the fee via fee().
const adapterConfigV3 = {
  ...baseConfig,
  isAlgebraV3: true,
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  breakdownMethodology,
  adapter: {
    [CHAIN.APECHAIN]: {
      fetch: getUniV3LogAdapter({
        factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
        ...adapterConfig,
      }),
      start: '2024-10-15',
    },
    [CHAIN.ARBITRUM]: {
      fetch: async (options: FetchOptions) => {
        // Arbitrum has two factories that need to be combined
        const adapter1 = getUniV3LogAdapter({
          factory: '0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B',
          ...adapterConfig,
          blacklistPools: [
            '0xf3527ef8de265eaa3716fb312c12847bfba66cef',
            '0x7788a3538c5fc7f9c7c8a74eac4c898fc8d87d92',
            '0x8467f85a834159c26227b21f9898ca0fa606eaa8',
          ],
        });
        const adapter2 = getUniV3LogAdapter({
          factory: '0xd490f2f6990c0291597fd1247651b4e0dcf684dd',
          ...adapterConfig,
        });

        const [res1, res2] = await Promise.all([
          adapter1(options),
          adapter2(options),
        ]);

        // Combine results from both factories
        if (res2.dailyFees) res1.dailyFees.addBalances(res2.dailyFees);
        if (res2.dailyVolume) res1.dailyVolume.addBalances(res2.dailyVolume);
        if (res2.dailyRevenue) res1.dailyRevenue.addBalances(res2.dailyRevenue);
        if (res2.dailyProtocolRevenue) res1.dailyProtocolRevenue.addBalances(res2.dailyProtocolRevenue);
        if (res2.dailyHoldersRevenue) res1.dailyHoldersRevenue.addBalances(res2.dailyHoldersRevenue);
        if (res2.dailySupplySideRevenue) res1.dailySupplySideRevenue.addBalances(res2.dailySupplySideRevenue);
        if (res2.dailyUserFees) res1.dailyUserFees.addBalances(res2.dailyUserFees);

        return res1;
      },
      start: '2023-03-31',
    },
    [CHAIN.GRAVITY]: {
      fetch: getUniV3LogAdapter({
        factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
        ...adapterConfig,
      }),
      start: '2024-07-04',
    },
    [CHAIN.RARI]: {
      fetch: getUniV3LogAdapter({
        factory: '0xcF8d0723e69c6215523253a190eB9Bc3f68E0FFa',
        ...adapterConfig,
      }),
      start: '2024-06-05',
    },
    [CHAIN.REYA]: {
      fetch: getUniV3LogAdapter({
        factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
        ...adapterConfig,
      }),
      start: '2024-06-20',
    },
    [CHAIN.PLUME]: {
      fetch: getUniV3LogAdapter({
        factory: '0x1eb9822d5176c88b1d4eec353fa956c896d77df9',
        ...adapterConfigV3,
      }),
      start: '2025-08-16',
    },
    [CHAIN.SUPERPOSITION]: {
      fetch: getUniV3LogAdapter({
        factory: '0xCf4062Ee235BbeB4C7c0336ada689ed1c17547b6',
        ...adapterConfig,
      }),
      start: '2025-01-14',
    },
    // [CHAIN.SANKO]: {
    //   fetch: getUniV3LogAdapter({
    //     factory: '0xcF8d0723e69c6215523253a190eB9Bc3f68E0FFa',
    //     ...adapterConfig,
    //   }),
    //   start: '2024-04-17',
    // },
  },
};

export default adapter;
