import { cache } from "@defillama/sdk";
import { FetchOptions, IJSON, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { ethers } from "ethers";
import { filterPools } from '../../helpers/uniswap';
import { addOneToken } from "../../helpers/prices";

const factory = '0x1f0b70d9a137e3caef0ceacd312bc5f81da0cc0c'
const poolCreatedEvent = 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'
const poolSwapEvent = 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)'

function getRevenueRatio(fee: number): number {
  /**
   * Katana V3 Fee Structure
   * Source: https://docs.roninchain.com/apps/katana/swap-tokens
   * 
   * Fee tiers and breakdown:
   * 1. 0.01% - Stablecoin pairs
   *    - 0.005% LP fee
   *    - 0.005% Ronin Treasury fee
   * 
   * 2. 0.3% - Most trading pairs
   *    - 0.25% LP fee
   *    - 0.05% Ronin Treasury fee
   * 
   * 3. 1% - High-volatility pairs
   *    - 0.85% LP fee
   *    - 0.15% Ronin Treasury fee
   */
  if (fee === 0.0001) return 0.00005;
  if (fee === 0.003) return 0.0005;
  if (fee === 0.01) return 0.0015;
  return 0;
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
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

  if (!Object.keys(filteredPairs).length) return { dailyVolume, dailyFees }

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
  version: 1,
  adapter: {
    [CHAIN.RONIN]: {
      fetch,
      start: "2024-11-26",
    }
  },
  methodology: {
    Fees: "Total trading fees - sum of LP fees and protocol fees. LP fees vary by pool type (0.25% for most pools, with some special pools having different rates). Protocol fees are 0.05% for most pools.",
    Revenue: "Protocol fees collected by Katana - 0.05% of each trade for most pools",
    ProtocolRevenue: "Protocol fees collected by Katana - 0.05% of each trade for most pools",
    SupplySideRevenue: "Fees distributed to LPs - 0.25% of each trade for most pools",
    UserFees: "Same as Fees - total trading fees paid by users"
  }
};

export default adapter;
