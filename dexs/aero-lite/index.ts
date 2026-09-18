import * as sdk from '@defillama/sdk';
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getDefaultDexTokensBlacklisted } from '../../helpers/lists';
import { addOneToken } from '../../helpers/prices';
import { formatAddress } from '../../utils/utils';
import { ethers } from "ethers";
import PromisePool from "@supercharge/promise-pool";

// Aero Lite - Aerodrome's first deployment outside Base, live since Arc's 2026-09-16
// public mainnet launch. Tracked as its own listing rather than a chain on
// dexs/aerodrome-slipstream because Arc's CL pools use a continuously-adjusting
// dynamic fee: sampling CLPool.fee() on-chain showed one pool moving 700 -> 700 ->
// 420 -> 340 across a single day, and drifting ~20% within just a few hundred blocks
// (minutes). Base's Slipstream fee is a rarely-changed governance rate, so a single
// fee() snapshot per window is fine there; on Arc it isn't, so fee() is resampled
// per block-range chunk (the same chunking already used to page through Swap logs)
// and applied only to the swaps inside that chunk.
//
// No Voter/veAERO gauge system is deployed on Arc yet: factory.voter() and every
// pool's gauge()/unstakedFee() read back the zero address on-chain, matching this
// being the "Lite" phase ahead of the full Aero launch. So 100% of swap fees
// currently accrue to LPs as SupplySideRevenue; if gauges go live later this needs
// the same holders-revenue/bribes split dexs/aerodrome-slipstream has for Base.
const FACTORY = '0xb89Df768aF2CFE637ceB352c587Fe8edAf491d03'
const FACTORY_DEPLOY_BLOCK = 21068653 // Arc's 2026-09-16 public mainnet launch boundary

const eventAbis = {
  event_poolCreated: 'event PoolCreated(address indexed token0, address indexed token1, int24 indexed tickSpacing, address pool)',
  event_swap: 'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
}
const FEE_ABI = 'uint256:fee'

const BLOCK_STEP = 1000

const fetch = async (fetchOptions: FetchOptions): Promise<FetchResult> => {
  const { api, createBalances, getToBlock, getFromBlock, chain, getLogs } = fetchOptions
  const dailyVolume = createBalances()
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const [toBlock, fromBlock] = await Promise.all([getToBlock(), getFromBlock()])

  const rawPools = await getLogs({
    target: FACTORY,
    fromBlock: FACTORY_DEPLOY_BLOCK,
    toBlock,
    eventAbi: eventAbis.event_poolCreated,
    cacheInCloud: true,
  })

  // Same spam/scam-token guard dexs/aerodrome-slipstream applies on Base; no wash-pool
  // filter yet (Dune's dex.trades doesn't index Arc yet, and there's no trading history
  // to build a wash baseline from on a chain this new).
  const blacklistTokens = new Set(getDefaultDexTokensBlacklisted(chain))
  const pools = (rawPools as any[]).filter(({ token0, token1 }) =>
    !blacklistTokens.has(formatAddress(token0)) && !blacklistTokens.has(formatAddress(token1))
  )
  if (!pools.length) return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue }

  const poolInfoMap: Record<string, { token0: string; token1: string }> = {}
  const poolAddrs: string[] = []
  for (const { token0, token1, pool } of pools) {
    const p = pool.toLowerCase()
    poolInfoMap[p] = { token0, token1 }
    poolAddrs.push(p)
  }
  const poolSet = new Set(poolAddrs)

  const ranges: Array<[number, number]> = []
  for (let start = fromBlock; start < toBlock; start += BLOCK_STEP) {
    ranges.push([start, Math.min(start + BLOCK_STEP - 1, toBlock)])
  }

  const iface = new ethers.Interface([eventAbis.event_swap])
  let errorFound: any = false
  let progress = 0

  await PromisePool
    .withConcurrency(5)
    .for(ranges)
    .process(async ([startBlock, endBlock]) => {
      if (errorFound) return
      try {
        const [logs, fees] = await Promise.all([
          getLogs({
            noTarget: true,
            fromBlock: startBlock,
            toBlock: endBlock,
            eventAbi: eventAbis.event_swap,
            entireLog: true,
            skipCache: true,
          }),
          // Dynamic fee: resample per chunk instead of once for the whole window (see
          // header comment). endBlock stands in for "the fee during this chunk";
          // permitFailure covers pools created after startBlock (no code yet at
          // earlier blocks in the chunk, which is moot since such a pool has no
          // swaps to price before it exists anyway).
          api.multiCall({ abi: FEE_ABI, calls: poolAddrs, block: endBlock, permitFailure: true }),
        ])
        const feeByPool: Record<string, number> = {}
        poolAddrs.forEach((p, i) => { feeByPool[p] = Number(fees[i] ?? 0) / 1e6 })

        sdk.log(`Aero Lite got logs (${logs.length}) for chunk ${progress++}/${ranges.length}`)
        logs.forEach((log: any) => {
          const pool = (log.address || log.source).toLowerCase()
          if (!poolSet.has(pool)) return
          const { token0, token1 } = poolInfoMap[pool]
          const fee = feeByPool[pool]
          const parsedLog = iface.parseLog(log)
          const amount0 = Number(parsedLog!.args.amount0)
          const amount1 = Number(parsedLog!.args.amount1)
          addOneToken({ chain, balances: dailyVolume, token0, token1, amount0, amount1 })
          if (!fee) return
          // Fees are taken from the input side. amount0 > 0 means token0 was input.
          if (amount0 > 0) {
            const feeAmount = amount0 * fee
            dailyFees.add(token0, feeAmount, 'Token Swap Fees')
            dailySupplySideRevenue.add(token0, feeAmount, 'Unstaked-LP Fees')
          }
          if (amount1 > 0) {
            const feeAmount = amount1 * fee
            dailyFees.add(token1, feeAmount, 'Token Swap Fees')
            dailySupplySideRevenue.add(token1, feeAmount, 'Unstaked-LP Fees')
          }
        })
      } catch (e) {
        errorFound = e
        throw e
      }
    })

  if (errorFound) throw errorFound

  return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue }
}

const methodology = {
  Volume: 'Swap volume on Aero Lite (Aerodrome Slipstream-style concentrated liquidity pools on Arc): one side of every swap. Not yet filtered for wash trading; Arc is not indexed on Dune\'s dex.trades yet.',
  Fees: "Total swap fees paid by traders. Per-pool fee rate read from CLPool.fee(), which adjusts continuously with volatility on Arc (unlike Base's rarely-changed governance rate); resampled every ~1000 blocks and applied only to the swaps in that range, rather than one rate for the whole day.",
  Revenue: "Zero: Arc has no Voter/veAERO gauge system deployed yet, so nothing is currently redirected away from LPs.",
  SupplySideRevenue: "100% of swap fees, since no gauge exists yet to redirect any share to holders.",
}

const breakdownMethodology = {
  Fees: {
    'Token Swap Fees': 'All swap fees paid by traders on Aero Lite pools.',
  },
  SupplySideRevenue: {
    'Unstaked-LP Fees': "LPs' full share of swap fees; no gauge exists yet to redirect any share to holders.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  start: '2026-09-16',
  methodology,
  breakdownMethodology,
}

export default adapter
