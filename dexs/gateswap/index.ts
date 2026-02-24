import { cache } from '@defillama/sdk'
import { FetchV2, IJSON, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { addOneToken } from '../../helpers/prices'
import { filterPools } from '../../helpers/uniswap'

const FACTORY_ADDRESS = '0xaD8d59f3e026c02Aed0DAdFB46Ceca127030DFa2'
const SWAP_EVENT = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

const NEW_MAIN_ROUTER = '0x00000000d4c4a3528948586472f519d5fa2200ff'
const LEGACY_MAIN_ROUTER = '0x0000000067a38ab30ba8db9eebf5722c50d8efc0'
const ROUTERS = [NEW_MAIN_ROUTER, LEGACY_MAIN_ROUTER]

const ROUTER_SWAP_EVENT_ABIS = [
  'event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address to)',
  'event Swap(address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
  'event SwapExecuted(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'event Trade(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'event Route(address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
] as const

const GATE_LAYER_FETCH: FetchV2 = async (fetchOptions) => {
  const { createBalances, getLogs, api, chain } = fetchOptions
  const cacheKey = `tvl-adapter-cache/cache/uniswap-forks/${FACTORY_ADDRESS.toLowerCase()}-${chain}.json`
  const { pairs = [], token0s = [], token1s = [] } = await cache.readCache(cacheKey, { readFromR2Cache: true })
  if (!pairs.length) throw new Error('No pairs found for GateSwap')

  const pairObject: IJSON<string[]> = {}
  pairs.forEach((pair: string, i: number) => {
    pairObject[pair] = [token0s[i], token1s[i]]
  })

  const filteredPairs = await filterPools({ api, pairs: pairObject, createBalances })
  const pairIds = Object.keys(filteredPairs)
  const dailyVolume = createBalances()

  for (const pair of pairIds) {
    const [token0, token1] = pairObject[pair] || []
    if (!token0 || !token1) continue

    const swapLogs = await getLogs({ target: pair, eventAbi: SWAP_EVENT })
    if (!swapLogs?.length) continue

    swapLogs.forEach((log: any) => {
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0In, amount1: log.amount1In })
      addOneToken({ chain, balances: dailyVolume, token0, token1, amount0: log.amount0Out, amount1: log.amount1Out })
    })
  }

  return { dailyVolume }
}

function extractSwapFields(log: any) {
  const tokenIn = log.tokenIn ?? log.srcToken ?? log.inputToken ?? log.fromToken ?? log.sellToken ?? log.token0
  const tokenOut = log.tokenOut ?? log.dstToken ?? log.outputToken ?? log.toToken ?? log.buyToken ?? log.token1
  const amountIn = log.amountIn ?? log.inputAmount ?? log.amount0In ?? log.srcAmount ?? log.sellAmount ?? log.amount0
  const amountOut = log.amountOut ?? log.outputAmount ?? log.amount1Out ?? log.dstAmount ?? log.buyAmount ?? log.amount1

  if (!tokenIn || !tokenOut || amountIn == null || amountOut == null) return null
  return { tokenIn, tokenOut, amountIn, amountOut }
}

const EVM_ROUTER_FETCH: FetchV2 = async (fetchOptions) => {
  const { createBalances, getLogs, chain } = fetchOptions
  const dailyVolume = createBalances()

  for (const router of ROUTERS) {
    for (const eventAbi of ROUTER_SWAP_EVENT_ABIS) {
      try {
        const logs = await getLogs({ target: router, eventAbi })
        if (!logs.length) continue

        logs.forEach((log: any) => {
          const parsed = extractSwapFields(log)
          if (!parsed) return
          addOneToken({
            chain,
            balances: dailyVolume,
            token0: parsed.tokenIn,
            amount0: parsed.amountIn,
            token1: parsed.tokenOut,
            amount1: parsed.amountOut,
          })
        })

        // avoid double counting across overlapping ABI variants for the same router
        break
      } catch (e) {
        // ignore unsupported event signatures on specific chains/routers
      }
    }
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: `Gate Layer volume is computed from factory pairs and AMM Swap logs. Other EVM chains compute volume strictly from onchain router execution events emitted by GateSwap routers (first matching ABI per router), and underlying pool events are not directly counted there to avoid overlap.

**Note on Router Event ABI:**  
This adapter uses a best-effort set of candidate router event ABIs to extract swap volume from router logs across chains.  
If the actual GateSwap router emits a different or more specific event signature, we will update \`ROUTER_SWAP_EVENT_ABIS\` accordingly to pin the exact event and improve accuracy.`,
  },
  adapter: {
    [CHAIN.GATE_LAYER]: { fetch: GATE_LAYER_FETCH },
    [CHAIN.ETHEREUM]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.ARBITRUM]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.OPTIMISM]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.BASE]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.POLYGON]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.BSC]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.AVAX]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.ZKSYNC]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.WC]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.BERACHAIN]: { fetch: EVM_ROUTER_FETCH },
  },
}

export default adapter
