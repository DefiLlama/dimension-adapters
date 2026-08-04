import { Adapter, FetchOptions, FetchV2 } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { addOneToken } from "../helpers/prices";
import { filterPools } from "../helpers/uniswap";

const FACTORY = '0x701F02d3133E14a9dfd94C399586aC22A05bCa25'
const SWAP_EVENT = 'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
const FEE = 0.003 // 0.3%, PoolV2Pair.sol's fixed FEE_BPS constant (= 30 bps)

// Openlaunch's own V2 factory (PoolFactoryV2) is functionally a Uniswap v2
// fork but with a non-standard enumeration interface (a parameterless
// getAllPools() returning the whole pool array at once, rather than the
// classic allPairsLength()/allPairs(uint256) indexed-getter pair the generic
// getUniV2LogAdapter helper's built-in pair-discovery assumes) -- written as
// a custom fetch here instead, reusing the same underlying primitives
// (filterPools, addOneToken, getLogs, createBalances) the generic helper
// itself is built from. See projects/openlaunch/index.js in
// DefiLlama-Adapters for the same distinction on the TVL side.
const fetch: FetchV2 = async (fetchOptions: FetchOptions) => {
  const { createBalances, getLogs, api } = fetchOptions

  const pools: string[] = await api.call({
    abi: 'function getAllPools() view returns (address[])',
    target: FACTORY,
  })

  const dailyVolume = createBalances()
  const dailyFees = createBalances()

  if (!pools.length) return { dailyVolume, dailyFees }

  const token0s = await api.multiCall({ abi: 'address:token0', calls: pools })
  const token1s = await api.multiCall({ abi: 'address:token1', calls: pools })
  const pairObject: Record<string, string[]> = {}
  pools.forEach((pool, i) => { pairObject[pool] = [token0s[i], token1s[i]] })

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
  const pairIds = Object.keys(filteredPairs)
  if (!pairIds.length) return { dailyVolume, dailyFees }

  const allLogs = await getLogs({ targets: pairIds, eventAbi: SWAP_EVENT, flatten: false })
  allLogs.forEach((logs: any[], index: number) => {
    const pool = pairIds[index]
    const [token0, token1] = pairObject[pool]
    logs.forEach((log: any) => {
      addOneToken({ chain: CHAIN.STABLE, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain: CHAIN.STABLE, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
      addOneToken({ chain: CHAIN.STABLE, balances: dailyFees, token0, token1, amount0: Number(log.amount0In) * FEE, amount1: Number(log.amount1In) * FEE })
      addOneToken({ chain: CHAIN.STABLE, balances: dailyFees, token0, token1, amount0: Number(log.amount0Out) * FEE, amount1: Number(log.amount1Out) * FEE })
    })
  })

  // No protocol fee today -- 100% of swap fees go to LPs (see openlaunch-v3.ts).
  return {
    dailyVolume,
    dailyFees,
    dailySupplySideRevenue: dailyFees,
  }
}

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.STABLE]: {
      fetch,
      start: '2026-08-03',
    },
  },
};

export default adapter;
