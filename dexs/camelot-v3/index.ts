import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getUniV3LogAdapter } from '../../helpers/uniswap';

// Camelot V3 uses Algebra (Uniswap V3-style concentrated liquidity) with a dynamic,
// per-swap-direction fee. Each pool's fee is read live from globalState() (fee() reverts).
// Fee distribution: 85% to liquidity providers, 15% protocol fee (on-chain community fee),
// with the 15% split 7% xGRAIL stakers + 3.5% GRAIL buyback&burn + 3% operating expenses + 1.5% Algebra licensing.
// Source: https://docs.camelot.exchange/tokenomics/protocol-earnings
// Architecture: https://docs.camelot.exchange/protocol/amm-v3

const methodology = {
  Fees: 'Dynamic swap fees paid by traders on every Camelot V3 pool. Each pool\'s fee adjusts with volatility and is read live from the pool.',
  UserFees: 'Traders pay the full dynamic swap fee on each trade (roughly 0.01% on stable pairs up to a few percent on volatile pairs).',
  Revenue:
    '15% of every swap fee is taken as a protocol fee; the other 85% stays with liquidity providers. Of the 15%: 7% goes to xGRAIL stakers, 3.5% to GRAIL buyback & burn, 3% to operating expenses, and 1.5% to Algebra for V3 AMM licensing.',
  ProtocolRevenue: '3% of swap fees fund Camelot\'s operating expenses (treasury).',
  HoldersRevenue:
    '10.5% of swap fees benefit GRAIL holders: 7% to xGRAIL stakers via Real Yield Staking and 3.5% to buy back and burn GRAIL.',
  SupplySideRevenue: '85% of swap fees go to liquidity providers.',
};

const breakdownMethodology = {
  UserFees: {
    'Trading fees': 'Dynamic swap fee paid by traders on each swap, varying per pool with market volatility',
  },
  Fees: {
    'Token Swap Fees': 'Total swap fees collected across all Camelot V3 pools using Algebra\'s dynamic fee',
  },
  Revenue: {
    'Protocol fees': 'Protocol fee taken from swaps, equal to the 15% on-chain community fee',
  },
  ProtocolRevenue: {
    'Protocol fees': '3% of swap fees routed to Camelot operating expenses (treasury)',
  },
  HoldersRevenue: {
    'Tokenholder fees': '10.5% of swap fees benefiting GRAIL holders (7% to xGRAIL Real Yield Staking + 3.5% GRAIL buyback & burn)',
  },
  SupplySideRevenue: {
    'LP fees': '85% of swap fees distributed to liquidity providers',
  },
};

// Fee split ratios (on-chain community fee = 150/1000 = 15%)
const REVENUE_RATIO = 0.15; // 15% protocol-controlled (community fee), 85% to LPs
const USER_FEES_RATIO = 1; // Users pay 100% of fees
const PROTOCOL_REVENUE_RATIO = 0.03; // 3% operating expenses (treasury)
const HOLDERS_REVENUE_RATIO = 0.105; // 7% xGRAIL stakers + 3.5% GRAIL buyback & burn

const adapterConfig = {
  userFeesRatio: USER_FEES_RATIO,
  revenueRatio: REVENUE_RATIO,
  protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
  holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
  poolCreatedEvent: 'event Pool (address indexed token0, address indexed token1, address pool)',
  isAlgebraV2: true,
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
