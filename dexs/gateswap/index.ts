import { cache } from '@defillama/sdk'
import { FetchV2, IJSON, SimpleAdapter } from '../../adapters/types'
import { CHAIN } from '../../helpers/chains'
import { getEnv } from '../../helpers/env'
import { addOneToken } from '../../helpers/prices'
import { filterPools } from '../../helpers/uniswap'
import { postURL } from '../../utils/fetchURL'

const FACTORY_ADDRESS = '0xaD8d59f3e026c02Aed0DAdFB46Ceca127030DFa2'
const SWAP_EVENT = 'event Swap(address indexed sender, uint amount0In, uint amount1In, uint amount0Out, uint amount1Out, address indexed to)'

const NEW_MAIN_ROUTER = '0x00000000d4c4a3528948586472f519d5fa2200ff'
const LEGACY_MAIN_ROUTER = '0x0000000067a38ab30ba8db9eebf5722c50d8efc0'
const ROUTERS = [NEW_MAIN_ROUTER, LEGACY_MAIN_ROUTER]

// Candidate swap events for router-level execution logs.
const ROUTER_SWAP_EVENT_ABIS = [
  'event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address to)',
  'event Swap(address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
  'event SwapExecuted(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'event Trade(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'event Route(address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
] as const

const SOLANA_PROGRAM_ID = '2rwUXt3JeyPtUBjH5pscZLRDBoh9WADfXq7gyoDnLcC4'
const SOLANA_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
const SOLANA_USDT = 'Es9vMFrzaCERmJfrF4H2FYD2R2aXGm3kA8T6wL6Xh7R'
const SOLANA_SOL_WRAPPED = 'So11111111111111111111111111111111111111112'
const SOLANA_PRIORITY_MINTS = new Set([SOLANA_USDC, SOLANA_USDT, SOLANA_SOL_WRAPPED])

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
      } catch (e) {
        // ignore unsupported event signatures on specific chains/routers
      }
    }
  }

  return { dailyVolume }
}

const SOLANA_FETCH: FetchV2 = async (options) => {
  const dailyVolume = options.createBalances()
  const rpc = getEnv('SOLANA_RPC')

  try {
    const signatures: string[] = []
    let before: string | undefined

    while (true) {
      const resp: any = await postURL(rpc, {
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignaturesForAddress',
        params: [SOLANA_PROGRAM_ID, { limit: 1000, before }],
      })
      const rows = resp?.result ?? []
      if (!rows.length) break

      let shouldBreak = false
      for (const row of rows) {
        if (!row?.blockTime) continue
        if (row.blockTime < options.startTimestamp) {
          shouldBreak = true
          break
        }
        if (row.blockTime <= options.endTimestamp) signatures.push(row.signature)
      }

      before = rows[rows.length - 1]?.signature
      if (!before || shouldBreak || rows.length < 1000) break
    }

    for (const signature of signatures) {
      try {
        const txResp: any = await postURL(rpc, {
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [signature, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }],
        })

        const tx = txResp?.result
        const meta = tx?.meta
        const message = tx?.transaction?.message
        if (!meta || !message) continue

        const signerSet = new Set((message.accountKeys || []).filter((k: any) => k?.signer).map((k: any) => k.pubkey))
        if (!signerSet.size) continue

        const deltas: Record<string, bigint> = {}
        const preByIdx = new Map<number, any>((meta.preTokenBalances || []).map((b: any) => [b.accountIndex, b]))

        for (const post of (meta.postTokenBalances || [])) {
          const pre = preByIdx.get(post.accountIndex)
          const owner = post.owner || pre?.owner
          const mint = post.mint || pre?.mint
          if (!owner || !mint || !signerSet.has(owner)) continue
          const decimals = post.uiTokenAmount?.decimals ?? pre?.uiTokenAmount?.decimals ?? 0
          const postAmt = BigInt(post.uiTokenAmount?.amount ?? '0')
          const preAmt = BigInt(pre?.uiTokenAmount?.amount ?? '0')
          const delta = postAmt - preAmt
          if (delta === 0n) continue
          const key = `${mint}::${decimals}`
          deltas[key] = (deltas[key] ?? 0n) + delta
        }

        const candidates = Object.entries(deltas)
          .map(([k, v]) => ({ key: k, mint: k.split('::')[0], absDelta: v < 0n ? -v : v }))
          .filter((x) => x.absDelta > 0n)

        if (!candidates.length) continue

        candidates.sort((a, b) => {
          if (SOLANA_PRIORITY_MINTS.has(a.mint) && !SOLANA_PRIORITY_MINTS.has(b.mint)) return -1
          if (!SOLANA_PRIORITY_MINTS.has(a.mint) && SOLANA_PRIORITY_MINTS.has(b.mint)) return 1
          return a.absDelta > b.absDelta ? -1 : 1
        })

        const picked = candidates[0]
        if (!picked) continue

        dailyVolume.add(`solana:${picked.mint}`, picked.absDelta.toString())
      } catch (e) {
        // ignore malformed or pruned transactions
      }
    }
  } catch (e) {
    // keep adapter resilient for days/chains with RPC issues
  }

  return { dailyVolume }
}

const adapter: SimpleAdapter = {
  version: 2,
  methodology: {
    Volume: 'Gate Layer volume is computed from factory pairs and Swap logs. Other EVM chains compute aggregator volume from onchain router swap execution logs emitted by both GateSwap routers. Solana volume is computed from onchain transactions that invoke the GateSwap program, attributing one user-side token delta per swap transaction to avoid double counting.',
  },
  start: '2025-09-27',
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
    worldchain: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.BERACHAIN]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.SOLANA]: { fetch: SOLANA_FETCH },
  },
}

export default adapter
