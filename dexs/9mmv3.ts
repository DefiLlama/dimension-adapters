import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniV3LogAdapter, UniGetRevenueRatioProps } from "../helpers/uniswap";

const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

// half of the protocol's cut is passed on to token holders, the rest stays with the protocol
// https://9mm-pro.gitbook.io/9mm-pro/overview/revenue-sharing-model
const HOLDERS_SHARE = 0.5

// each pool sets its share in initialize() from its fee tier, over a 10000 denominator, verified
// on chain: a 0.25% pulsechain pool reads feeProtocol 209718400 and takes exactly 0.32 of the fee
const getProtocolRevenueRatio = (fee: number): number => {
  if (fee === 0.0001) return 0.33; 
  if (fee === 0.0005) return 0.34; 
  if (fee === 0.0025) return 0.32; 
  if (fee === 0.01) return 0.32;
  return 0.32; 
}

const config: Record<string, { factory: string, start: string }> = {
  [CHAIN.PULSECHAIN]: { factory: '0xe50dbdc88e87a2c92984d794bcf3d1d76f619c68', start: '2024-12-19' },
  [CHAIN.BASE]: { factory: '0x7b72C4002EA7c276dd717B96b20f4956c5C904E7', start: '2024-12-19' },
  [CHAIN.SONIC]: { factory: '0x924aee3929C8A45aC9c41e9e9Cdf3eA761ca75e5', start: '2025-03-14' }
}

const buildEvmFetcher = (factory: string) => {
  const evmAdapter = getUniV3LogAdapter({
    factory,
    swapEvent: poolSwapEvent,
    userFeesRatio: 1,
    getRevenueRatio: ({ poolFeeTier }: UniGetRevenueRatioProps) => {
      const _revenueRatio = getProtocolRevenueRatio(poolFeeTier);
      // half of what the protocol takes is passed on to token holders
      const _holdersRevenueRatio = _revenueRatio * HOLDERS_SHARE;
      return {
        _revenueRatio,
        _protocolRevenueRatio: _revenueRatio - _holdersRevenueRatio,
        _holdersRevenueRatio,
      };
    },
  })
  return async (options: FetchOptions) => evmAdapter(options)
}

const methodology = {
  Volume: 'Swap volume from all 9mm V3 pools deployed by the V3 factory.',
  Fees: "Traders pay each pool's configured fee tier on every swap.",
  UserFees: 'Equals total swap fees paid by traders.',
  Revenue: 'Share of the swap fee the pool keeps for the protocol, set from its fee tier: 33% on the 0.01% tier, 34% on 0.05%, 32% on 0.25% and 1%.',
  ProtocolRevenue: 'Half of the revenue, the share that stays with the protocol.',
  HoldersRevenue: 'The other half of the revenue, passed on to token holders.',
  SupplySideRevenue: 'The rest of the swap fee, kept by the liquidity providers.',
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: Object.fromEntries(
    Object.entries(config).map(([chain, { factory, start }]) => [chain, { fetch: buildEvmFetcher(factory), start }])
  ),
  methodology,
}

export default adapter;
