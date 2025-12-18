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
    start: '2024-01-01',
  },
  [CHAIN.ARBITRUM]: {
    factory: '0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
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
    start: '2024-01-01',
  },
  [CHAIN.RARI]: {
    factory: '0xcF8d0723e69c6215523253a190eB9Bc3f68E0FFa',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-01-01',
  },
  [CHAIN.REYA]: {
    factory: '0x10aA510d94E094Bd643677bd2964c3EE085Daffc',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-01-01',
  },
  [CHAIN.SANKO]: {
    factory: '0xcF8d0723e69c6215523253a190eB9Bc3f68E0FFa',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-01-01',
  },
  [CHAIN.XDAI]: {
    factory: '0xD8676fBdfa5b56BB2298D452c9768f51e80e34AE',
    swapEvent: algebraV3SwapEvent,
    isAlgebraV3: true,
    isAlgebraV2: true,
    revenueRatio: REVENUE_RATIO,
    protocolRevenueRatio: PROTOCOL_REVENUE_RATIO,
    holdersRevenueRatio: HOLDERS_REVENUE_RATIO,
    start: '2024-01-01',
  },
});

adapter.methodology = methodology;

export default adapter;
