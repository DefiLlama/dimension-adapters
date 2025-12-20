import { SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { uniV3Exports } from '../helpers/uniswap';

const algebraV3SwapEvent =
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 price, uint128 liquidity, int24 tick, uint24 overrideFee, uint24 pluginFee)';

// Fee breakdown: 60% LPs, 22.5% xGRAIL holders, 17.5% protocol (5% operating + 12.5% buyback/burn)
// Source: https://docs.camelot.exchange/tokenomics/protocol-earnings
const REVENUE_RATIO = 0.4; // 40% protocol revenue (17.5% protocol + 22.5% holders)
const PROTOCOL_REVENUE_RATIO = 0.175; // 17.5% (5% operating + 12.5% buyback/burn)
const HOLDERS_REVENUE_RATIO = 0.225; // 22.5% xGRAIL holders

const methodology = {
  Fees: 'Trading fees charged on swaps. Camelot V2 uses Algebra-based Uniswap V3 with dynamic fees.',
  UserFees: 'Fees paid by traders on swaps.',
  Revenue:
    'Portion of trading fees that goes to the protocol (17.5%) and xGRAIL holders (22.5%).',
  ProtocolRevenue:
    '17.5% of trading fees (5% operating expenses + 12.5% GRAIL buyback/burn).',
  HoldersRevenue:
    '22.5% of trading fees go to xGRAIL holders via Real Yield Staking.',
  SupplySideRevenue: '60% of trading fees go to liquidity providers.',
};

const adapter: SimpleAdapter = uniV3Exports({
  [CHAIN.APECHAIN]: {
    factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-10-15',
  },
  [CHAIN.ARBITRUM]: {
    factory: '0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    blacklistPools: [
      '0xf3527ef8de265eaa3716fb312c12847bfba66cef',
      '0x7788a3538c5fc7f9c7c8a74eac4c898fc8d87d92',
      '0x8467f85a834159c26227b21f9898ca0fa606eaa8',
    ],
    start: '2023-06-14',
  },
  [CHAIN.GRAVITY]: {
    factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-07-04',
  },
  [CHAIN.RARI]: {
    factory: '0xcF8d0723e69c6215523253a190eB9Bc3f68E0FFa',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-06-05',
  },
  [CHAIN.REYA]: {
    factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-06-20',
  },
  [CHAIN.SANKO]: {
    factory: '0xcF8d0723e69c6215523253a190eB9Bc3f68E0FFa',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-04-17',
  },
  [CHAIN.SUPERPOSITION]: {
    factory: '0xCf4062Ee235BbeB4C7c0336ada689ed1c17547b6',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-09-01',
  },
  [CHAIN.WINR]: {
    factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-10-01',
  },
});

adapter.methodology = methodology;

export default adapter;
