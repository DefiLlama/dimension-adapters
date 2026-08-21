import { CHAIN } from "../helpers/chains";
import { uniV3Exports, UniGetRevenueRatioProps } from "../helpers/uniswap";

// https://www.oklink.com/x-layer/evm/address/0x3cea59ae7cd3c1bea32ccc80f68dd47576662c90/contract
const FACTORY = "0x3cEA59ae7CD3C1BEa32Ccc80F68Dd47576662c90";

const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

//It is PancakeSwap V3 direct fork so the revenue ratio is the same (confirmed via calling slot0())
const getProtocolRevenueRatio = (fee: number): number => {
  if (fee === 0.0001) return 0.33;
  if (fee === 0.0005) return 0.34;
  if (fee === 0.0025) return 0.32;
  if (fee === 0.01) return 0.32;
  return 0.32;
}

const blacklistPools = ['0x4e6c7d221b5fa285aabdd8c7fa692bc0c79e7d8b']

const METRIC = {
  SWAP_FEES: 'Token Swap Fees',
  TRADING_FEES: 'Trading fees',
  PROTOCOL_FEES: 'Protocol fees',
  LP_FEES: 'LP fees',
}

const methodology = {
  Volume: 'Swap volume from all OkieSwap V3 pools deployed by the V3 factory.',
  Fees: "Traders pay each pool's configured fee tier on every swap.",
  Revenue: 'Share of the swap fee the pool keeps for the protocol, set from its fee tier: 33% on the 0.01% tier, 34% on 0.05%, 32% on 0.25% and 1%.',
  ProtocolRevenue: 'All of the revenue stays with the protocol; OkieSwap has no token holder distribution.',
  SupplySideRevenue: 'The rest of the swap fee, kept by the liquidity providers.',
}

const breakdownMethodology = {
  Fees: { [METRIC.SWAP_FEES]: "Swap fees charged at each pool's configured fee tier." },
  UserFees: { [METRIC.TRADING_FEES]: 'Swap fees paid by traders.' },
  Revenue: { [METRIC.PROTOCOL_FEES]: 'Share of the swap fee kept for the protocol.' },
  ProtocolRevenue: { [METRIC.PROTOCOL_FEES]: 'Share of the swap fee kept for the protocol.' },
  SupplySideRevenue: { [METRIC.LP_FEES]: 'Swap fees kept by the liquidity providers.' },
}

const adapter = uniV3Exports({
  [CHAIN.XLAYER]: {
    factory: FACTORY,
    start: '2025-08-17',
    userFeesRatio: 1,
    blacklistPools,
    getRevenueRatio: ({ poolFeeTier }: UniGetRevenueRatioProps) => {
      const _revenueRatio = getProtocolRevenueRatio(poolFeeTier);
      return { _revenueRatio, _protocolRevenueRatio: _revenueRatio };
    },
  },
}, { swapEvent: poolSwapEvent, methodology, breakdownMethodology });

export default adapter;
