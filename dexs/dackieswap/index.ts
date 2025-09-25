import { CHAIN } from "../../helpers/chains";
import { cache } from "@defillama/sdk";
import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { ethers } from "ethers";
import { filterPools } from '../../helpers/uniswap';
import { addOneToken } from "../../helpers/prices";

const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint128 protocolFeesToken0, uint128 protocolFeesToken1)'

const factories: {[key: string]: string} = {
  [CHAIN.BASE]: '0x3D237AC6D2f425D2E890Cc99198818cc1FA48870',
  [CHAIN.OPTIMISM]: '0xc2BC7A73613B9bD5F373FE10B55C59a69F4D617B',
  [CHAIN.ARBITRUM]: '0xaedc38bd52b0380b2af4980948925734fd54fbf4',
  [CHAIN.BLAST]: '0xCFC8BfD74422472277fB5Bc4Ec8851d98Ecb2976',
  [CHAIN.MODE]: '0xc6f3966E5D08Ced98aC30f8B65BeAB5882Be54C7',
  [CHAIN.LINEA]: '0xc6255ec7CDb11C890d02EBfE77825976457B2470',
  // [CHAIN.XLAYER]: '0xc6f3966e5d08ced98ac30f8b65beab5882be54c7',
}

function getRevenueRatio(fee: number): number {
  // DackieSwap Fee Structure - forked from Uniswap V3
  // Source: https://docs.dackieswap.xyz/dackieswap/product-features/traders/trading-fee#dackieswap-native-lp-fee
  if (fee === 0.0001) return 0.000033;
  if (fee === 0.0005) return 0.000165;
  if (fee === 0.0025) return 0.0008;
  if (fee === 0.01) return 0.0033;
  return 0;
}

const fetch = async (options: FetchOptions) => {
  const factory = String(factories[options.chain]).toLowerCase()
  const { createBalances, getLogs, chain, api } = options
  
  if (!chain) throw new Error('Wrong version?')
  
  const cacheKey = `tvl-adapter-cache/cache/logs/${chain}/${factory}.json`
  const iface = new ethers.Interface([poolCreatedEvent])
  let { logs } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!logs?.length) throw new Error('No pairs found, is there TVL adapter for this already?')
  logs = logs.map((log: any) => iface.parseLog(log)?.args)
  const pairObject: IJSON<string[]> = {}
  const fees: any = {}

  logs.forEach((log: any) => {
    pairObject[log.pool] = [log.token0, log.token1]
    fees[log.pool] = (log.fee?.toString() || 0) / 1e6 // seem some protocol v3 forks does not have fee in the log when not use defaultPoolCreatedEvent
  })
  
  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()

  if (!Object.keys(filteredPairs).length) return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }

  const allLogs = await getLogs({ targets: Object.keys(filteredPairs), eventAbi: poolSwapEvent, flatten: false })
  allLogs.map((logs: any, index) => {
    if (!logs.length) return;
    const pair = Object.keys(filteredPairs)[index]
    const [token0, token1] = pairObject[pair]
    const fee = fees[pair]
    logs.forEach((log: any) => {
      const revenueRatio = getRevenueRatio(fee);
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0, amount1: log.amount1 })
      addOneToken({ chain, balances: dailyFees, token0, token1, amount0: log.amount0.toString() * fee, amount1: log.amount1.toString() * fee })
      addOneToken({ chain, balances: dailyRevenue, token0, token1, amount0: log.amount0.toString() * revenueRatio, amount1: log.amount1.toString() * revenueRatio })
      addOneToken({ chain, balances: dailySupplySideRevenue, token0, token1, amount0: log.amount0.toString() * (fee - revenueRatio), amount1: log.amount1.toString() * (fee - revenueRatio) })
    })
  })
  
  return { dailyVolume, dailyFees, dailyUserFees: dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue: dailyRevenue }
}

const adapter: SimpleAdapter = {
  methodology: {
    Fees: "Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools.",
    UserFees: "Same as Fees - total trading fees paid by users",
    Revenue: "Protocol fees collected by DackieSwap - 0.05% of each trade for most pools",
    SupplySideRevenue: "Fees distributed to LPs - 0.25% of each trade for most pools",
    ProtocolRevenue: "Protocol fees collected by DackieSwap - 0.05% of each trade for most pools",
  },
  fetch,
  chains: Object.keys(factories),
  version: 2
};

export default adapter;
