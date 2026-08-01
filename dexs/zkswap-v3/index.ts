import { CHAIN } from "../../helpers/chains";
import { BaseAdapter, SimpleAdapter } from "../../adapters/types";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from '../../helpers/uniswap';

const factories: { [key: string]: { address: string, start: string } } = {
  [CHAIN.ERA]:    { address: '0x88add6a7e3c221e02f978b388a092c9fd8cd7850', start: '2024-11-18' },
  [CHAIN.SONIC]:  { address: '0x6d977fcc945261b80d128a5a91cbf9a9148032a4', start: '2025-04-09' },
  [CHAIN.MONAD]:  { address: '0xf5Cf2b71B8B368c84C4C4903AF453E790d392285', start: '2025-11-24' },
}

const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

// Fee Structure - forked from Uniswap V3
// Source: https://docs.zkswap.finance/highlights/fee
function getZkswapRevenueRatio({ poolFeeTier }: UniGetRevenueRatioProps): { _revenueRatio: number, _protocolRevenueRatio?: number, _holdersRevenueRatio?: number } {
  if (poolFeeTier === 0.0001) return { _revenueRatio: 0.33, _protocolRevenueRatio: 0.33 };
  if (poolFeeTier === 0.0004) return { _revenueRatio: 0.34, _protocolRevenueRatio: 0.34 };
  if (poolFeeTier === 0.002)  return { _revenueRatio: 0.32, _protocolRevenueRatio: 0.32 };
  if (poolFeeTier === 0.01)   return { _revenueRatio: 0.32, _protocolRevenueRatio: 0.32 };
  return { _revenueRatio: 0, _protocolRevenueRatio: 0 };
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Fees: "A trading fee, depending on the fee tier of the CL pool, is collected.",
    UserFees: "Users pay a percentage of the volume, which equal to the pool fee tier, for each swap.",
    Revenue: "Approximately 33% of the fees go to the protocol.",
    ProtocolRevenue: "Approximately 33% of the fees go to the protocol.",
    SupplySideRevenue: "Approximately 67% of the fees are distributed to liquidity providers (ZFLP token holders).",
  },
  adapter: {},
}

for (const [chain, config] of Object.entries(factories)) {
  (adapter.adapter as BaseAdapter)[chain] = {
    fetch: getUniV3LogAdapter({
      factory: config.address,
      swapEvent: poolSwapEvent,
      userFeesRatio: 1,
      getRevenueRatio: getZkswapRevenueRatio,
    }),
    start: config.start,
  }
}

export default adapter;
