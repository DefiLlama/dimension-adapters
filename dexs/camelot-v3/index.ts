import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from '../../helpers/uniswap';

// Camelot V3 uses Algebra (Uniswap V3-style concentrated liquidity)
// The protocol's cut of each pool's swap fees is the pool's on-chain community fee:
// 15% on Arbitrum, 20% on the other deployments, 0% on a handful of pools.
// Camelot splits that cut 70% to GRAIL/xGRAIL holders (7% xGRAIL Real Yield Staking
// + 3.5% GRAIL buyback & burn of a 15% cut) and 30% to the protocol
// (3% operating expenses + 1.5% Algebra V3 licensing).
// Source: https://docs.camelot.exchange/tokenomics/protocol-earnings
// Architecture: https://docs.camelot.exchange/protocol/amm-v3

const methodology = {
  Fees: 'Trading fees paid by swappers. Each pool sets its own fee, which moves with volatility, and is read from the pool itself.',
  UserFees: 'Swappers pay the whole trading fee, typically between 0.01% and 1.5% of the trade.',
  Revenue:
    'The share of trading fees Camelot keeps rather than paying out to liquidity providers, read from each pool on-chain: 15% on Arbitrum, 20% on the other chains, and 0% on pools where Camelot has waived its cut.',
  ProtocolRevenue:
    '30% of what Camelot keeps, covering operating expenses and the Algebra V3 licence fee.',
  HoldersRevenue:
    '70% of what Camelot keeps, paid to GRAIL/xGRAIL holders through xGRAIL Real Yield Staking and GRAIL buyback & burn.',
  SupplySideRevenue: 'The rest of the trading fees, paid to liquidity providers — 85% on Arbitrum, 80% on the other chains, and 100% on pools where Camelot takes no cut.',
};

const breakdownMethodology = {
  UserFees: {
    'Trading fees': 'Fees paid by swappers, set per pool and moving with volatility, typically 0.01% to 1.5% of the trade',
  },
  Fees: {
    'Token Swap Fees': 'All trading fees collected across Camelot V3 pools, using each pool\'s own live fee rate',
  },
  Revenue: {
    'Protocol fees': 'The share of trading fees Camelot keeps instead of paying liquidity providers, taken from each pool\'s on-chain community fee setting',
  },
  ProtocolRevenue: {
    'Protocol fees': 'The part of Camelot\'s cut that funds operating expenses and the Algebra V3 AMM licence, 30% of what the protocol keeps',
  },
  HoldersRevenue: {
    'Tokenholder fees': 'The part of Camelot\'s cut paid to GRAIL/xGRAIL holders via Real Yield Staking and GRAIL buyback & burn, 70% of what the protocol keeps',
  },
  SupplySideRevenue: {
    'LP fees': 'Trading fees paid straight to the liquidity providers backing each pool',
  },
};

const USER_FEES_RATIO = 1; // Users pay 100% of fees
// Split of the pool community fee: docs give 7% + 3.5% to holders and 3% + 1.5% to the
// protocol out of a 15% cut, i.e. 70/30
const HOLDERS_SHARE = 0.7;
const PROTOCOL_SHARE = 0.3;

const algebraPoolCreatedEvent =
  'event Pool (address indexed token0, address indexed token1, address pool)';

// Revenue split comes from each pool's community fee, read on-chain
const getRevenueRatio = ({ communityFeeRatio }: UniGetRevenueRatioProps) => {
  if (communityFeeRatio === undefined) throw new Error('camelot-v3: could not read pool community fee');
  return {
    _revenueRatio: communityFeeRatio,
    _protocolRevenueRatio: communityFeeRatio * PROTOCOL_SHARE,
    _holdersRevenueRatio: communityFeeRatio * HOLDERS_SHARE,
  };
};

const baseConfig = {
  userFeesRatio: USER_FEES_RATIO,
  algebraCommunityFee: true,
  getRevenueRatio,
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
      deadFrom: '2026-07-08',
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
