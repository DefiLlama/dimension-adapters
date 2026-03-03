import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getUniV3LogAdapter } from '../../helpers/uniswap';

// Camelot V3 uses Algebra (Uniswap V3-style concentrated liquidity)
// Fees are pool-specific and read on-chain from the Algebra pool configuration
// Fee distribution (V3):
// - ~80% to Liquidity Providers
// - ~20% to protocol-controlled revenue (xGRAIL + treasury)
// Source: https://docs.camelot.exchange/tokenomics/protocol-earnings
// Architecture: https://docs.camelot.exchange/protocol/amm-v3

const methodology = {
  Fees: 'Trading fees charged on swaps. Camelot V3 uses Algebra with dynamic fees.',
  UserFees: 'Users pay dynamic fees on each swap (typically 0.05% to 1%).',
  Revenue:
    'Portion of trading fees that goes to the protocol (3%) and xGRAIL holders (17%), totaling 20% of swap fees.',
  ProtocolRevenue: '3% of trading fees go to the protocol.',
  HoldersRevenue:
    '17% of trading fees go to xGRAIL holders via Real Yield Staking.',
  SupplySideRevenue: '80% of trading fees go to liquidity providers.',
};

const breakdownMethodology = {
  UserFees: {
    'Trading fees': 'Dynamic fees paid by users on each swap, typically ranging from 0.05% to 1% of trade volume depending on market conditions',
  },
  Fees: {
    'Trading fees': 'Total trading fees collected from all swaps on Camelot V3 pools using Algebra\'s dynamic fee model',
  },
  Revenue: {
    'Protocol fees': 'Combined protocol-controlled revenue (20% of trading fees) split between protocol treasury (3%) and xGRAIL holders (17%)',
  },
  ProtocolRevenue: {
    'Protocol fees': 'Portion of trading fees allocated to the protocol treasury, equal to 3% of total swap fees',
  },
  HoldersRevenue: {
    'Tokenholder fees': 'Portion of trading fees distributed to xGRAIL holders through Real Yield Staking, equal to 17% of total swap fees',
  },
  SupplySideRevenue: {
    'LP fees': 'Portion of trading fees distributed to liquidity providers who supply capital to the pools, equal to 80% of total swap fees',
  },
};

// Fee split ratios
const REVENUE_RATIO = 0.2; // 20% total protocol-controlled
const USER_FEES_RATIO = 1; // Users pay 100% of fees
const PROTOCOL_REVENUE_RATIO = 0.03; // 3% protocol
const HOLDERS_REVENUE_RATIO = 0.17; // 17% xGRAIL holders

const adapterConfig = {
  userFeesRatio: USER_FEES_RATIO,
  revenueRatio: REVENUE_RATIO,
  protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
  holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
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
    [CHAIN.SANKO]: {
      fetch: getUniV3LogAdapter({
        factory: '0xcF8d0723e69c6215523253a190eB9Bc3f68E0FFa',
        ...adapterConfig,
      }),
      start: '2024-04-17',
    },
  },
};

export default adapter;
