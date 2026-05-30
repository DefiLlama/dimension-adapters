import { CHAIN } from "../../helpers/chains";
import { BaseAdapter, SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from '../../helpers/uniswap';

const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

const factories: { [key: string]: string } = {
  [CHAIN.BASE]:     '0x3D237AC6D2f425D2E890Cc99198818cc1FA48870',
  [CHAIN.OPTIMISM]: '0xc2BC7A73613B9bD5F373FE10B55C59a69F4D617B',
  [CHAIN.ARBITRUM]: '0xaedc38bd52b0380b2af4980948925734fd54fbf4',
  [CHAIN.BLAST]:    '0xCFC8BfD74422472277fB5Bc4Ec8851d98Ecb2976',
  [CHAIN.MODE]:     '0xc6f3966E5D08Ced98aC30f8B65BeAB5882Be54C7',
  [CHAIN.LINEA]:    '0xc6255ec7CDb11C890d02EBfE77825976457B2470',
  // [CHAIN.XLAYER]: '0xc6f3966e5d08ced98ac30f8b65beab5882be54c7',
}

// DackieSwap Fee Structure - forked from Uniswap V3
// Source: https://docs.dackieswap.xyz/dackieswap/product-features/traders/trading-fee#dackieswap-native-lp-fee
function getDackieRevenueRatio({ poolFeeTier }: UniGetRevenueRatioProps): { _revenueRatio: number, _protocolRevenueRatio?: number, _holdersRevenueRatio?: number } {
  if (poolFeeTier === 0.0001) return { _revenueRatio: 0.33, _protocolRevenueRatio: 0.33 };
  if (poolFeeTier === 0.0005) return { _revenueRatio: 0.33, _protocolRevenueRatio: 0.33 };
  if (poolFeeTier === 0.0025) return { _revenueRatio: 0.32, _protocolRevenueRatio: 0.32 };
  if (poolFeeTier === 0.01)   return { _revenueRatio: 0.33, _protocolRevenueRatio: 0.33 };
  return { _revenueRatio: 0, _protocolRevenueRatio: 0 };
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools.",
    UserFees: "Same as Fees - total trading fees paid by users",
    Revenue: "Protocol fees collected by DackieSwap - 0.05% of each trade for most pools",
    SupplySideRevenue: "Fees distributed to LPs - 0.25% of each trade for most pools",
    ProtocolRevenue: "Protocol fees collected by DackieSwap - 0.05% of each trade for most pools",
  },
  adapter: {},
};

for (const [chain, factory] of Object.entries(factories)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: getUniV3LogAdapter({
      factory,
      swapEvent: poolSwapEvent,
      userFeesRatio: 1,
      getRevenueRatio: getDackieRevenueRatio,
    }),
  }
}

export default adapter;
