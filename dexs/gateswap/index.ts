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

const ROUTER_SWAP_EVENT_ABIS = [
  'event Swap(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut, address to)',
  'event Swap(address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
  'event SwapExecuted(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'event Trade(address indexed sender, address indexed tokenIn, address indexed tokenOut, uint256 amountIn, uint256 amountOut)',
  'event Route(address indexed sender, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)',
] as const

const SOLANA_PROGRAM_ID = '2rwUXt3JeyPtUBjH5pscZLRDBoh9WADfXq7gyoDnLcC4'
const SOLANA_RPC_FALLBACK = 'https://api.mainnet-beta.solana.com'

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

const SOLANA_FETCH: FetchV2 = async (options) => {
  const dailyVolume = options.createBalances()
  const rpc = getEnv('SOLANA_RPC') || SOLANA_RPC_FALLBACK

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

        const hasProgramInvoke = (meta.logMessages || []).some((log: string) =>
          typeof log === 'string' && log.includes(`Program ${SOLANA_PROGRAM_ID} invoke`)
        )
        if (!hasProgramInvoke) continue

        const signerSet = new Set((message.accountKeys || []).filter((k: any) => k?.signer).map((k: any) => k.pubkey))
        if (!signerSet.size) continue

        const preByIdx = new Map<number, any>((meta.preTokenBalances || []).map((b: any) => [b.accountIndex, b]))
        const tokenOutflows: Record<string, bigint> = {}

        const allInstructionGroups = [
          ...(meta.innerInstructions || []).map((i: any) => i.instructions || []),
          message.instructions || [],
        ]

        for (const instructions of allInstructionGroups) {
          for (const instruction of instructions) {
            const parsed = instruction?.parsed
            const type = parsed?.type
            if (type !== 'transfer' && type !== 'transferChecked') continue

            const info = parsed.info || {}
            const source = info.source
            const authority = info.authority || info.owner || info.multisigAuthority
            const tokenAmount = info.tokenAmount?.amount
            if (!source || !tokenAmount) continue

            const sourceTokenAcc = (meta.postTokenBalances || []).find((b: any) => b.accountIndex != null && message.accountKeys?.[b.accountIndex]?.pubkey === source)
              || preByIdx.get((meta.preTokenBalances || []).find((b: any) => b.accountIndex != null && message.accountKeys?.[b.accountIndex]?.pubkey === source)?.accountIndex)

            const owner = sourceTokenAcc?.owner || authority
            const mint = sourceTokenAcc?.mint || info.mint

            if (!owner || !mint || !signerSet.has(owner)) continue

            tokenOutflows[mint] = (tokenOutflows[mint] ?? 0n) + BigInt(tokenAmount)
          }
        }

        const outflowEntries = Object.entries(tokenOutflows)
        if (!outflowEntries.length) continue

        outflowEntries.sort((a, b) => (a[1] > b[1] ? -1 : 1))
        const [mint, amount] = outflowEntries[0]
        dailyVolume.add(`solana:${mint}`, amount.toString())
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
    Volume: 'Gate Layer volume is computed from factory pairs and Swap logs. Other EVM chains compute aggregator volume from onchain router swap execution logs emitted by both GateSwap routers, using the first matching swap ABI per router to prevent overlap. Solana volume is computed from onchain transactions invoking the GateSwap program, parsing SPL transfer instructions/logs and attributing one signer-side transfer leg per swap transaction to avoid double counting.',
  },
  adapter: {
    [CHAIN.GATE_LAYER]: { fetch: GATE_LAYER_FETCH },
    [CHAIN.ETHEREUM]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.ARBITRUM]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.OPTIMISM]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.BASE]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.POLYGON]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.BSC]: { fetch: EVM_ROUTER_FETCH },
    [(CHAIN as any).AVALANCHE ?? CHAIN.AVAX]: { fetch: EVM_ROUTER_FETCH },
    [(CHAIN as any).ZKSYNC_ERA ?? CHAIN.ZKSYNC]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.WC]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.BERACHAIN]: { fetch: EVM_ROUTER_FETCH },
    [CHAIN.SOLANA]: { fetch: SOLANA_FETCH },
  },
}

export default adapter
