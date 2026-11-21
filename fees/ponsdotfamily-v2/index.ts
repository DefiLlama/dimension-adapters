import * as sdk from "@defillama/sdk";
import { id } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryClickhouse } from "../../helpers/indexer";
import { METRIC } from "../../helpers/metrics";

const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e"
const UNIV4_POOL_MANAGER = "0x58daec3116aae6D93017bAAea7749052E8a04fA7"
const MEME_HOOK = "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044"

const FACTORY_DEPLOYED_BLOCK = 26841846
const LAUNCH_FEE_WEI = 500000000000000
const BPS = 10000
const REORG_SAFETY_BLOCKS = 1000
// history sync is cached chunk by chunk, so an interrupted run resumes where it stopped
const HISTORY_SYNC_BLOCK_RANGE = 5_000_000

// TokenLaunched: token, curve, deployer indexed; data = [pairToken, launchConfigId, graduationThreshold]
const TOKEN_LAUNCHED_TOPIC0 = id("TokenLaunched(address,address,address,address,uint256,uint256)")
// PoolGraduated: token indexed; data = [positionId, tokenAmount, pairTokenAmount]
const POOL_GRADUATED_TOPIC0 = id("PoolGraduated(address,uint256,uint256,uint256)")
const POOL_FEE_SWEPT_EVENT = "event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount, uint256 tokensLocked)"
// CurveBuy/CurveSell: both addresses indexed; data = [amount0, amount1, fee, tax]
const CURVE_BUY_TOPIC0 = id("CurveBuy(address,address,uint256,uint256,uint256,uint256)")
const CURVE_SELL_TOPIC0 = id("CurveSell(address,address,uint256,uint256,uint256,uint256)")

const POSITION_INFO_FUNCTION = "function positionInfo(uint256 tokenId) view returns (uint256 info)"
const LAUNCH_FEE_POLICY_FUNCTION = "function getLaunchFeePolicy(address token) view returns (tuple(address protocolFeeRecipient, uint16 protocolFeeShareBps, uint16 buybackBurnBps, uint16 hookFeeBps, uint16 maxInternalPriceImpactBps))"

const CACHE_PROJECT = "ponsdotfamily-v2"

type FactoryCache = {
  lastBlock?: number
  curves: { [curve: string]: { token: string, pairToken: string } }
  poolIdToToken: { [poolIdPrefix: string]: string }
  pendingPositions: { [positionId: string]: string }
}

const elapsed = (t0: number) => `${((Date.now() - t0) / 1000).toFixed(1)}s`
const shortAddr = (addr: string) => addr.toLowerCase().substring(0, 10)

function factoryLogsFilter(chainId: number, topic0: string, fromBlock: number, toBlock: number) {
  return `PREWHERE chain = ${chainId}
      AND short_address = '${shortAddr(FACTORY)}'
      AND short_topic0 = '${topic0.substring(0, 10)}'
      AND address = '${FACTORY.toLowerCase()}'
      AND topic0 = '${topic0}'
      AND block_number >= ${fromBlock}
      AND block_number <= ${toBlock}`
}

function cacheFileKey(chain: string) {
  return `dimensions-adapter-cache/cache/${CACHE_PROJECT}/${chain}.json`
}

async function readFactoryCache(chain: string): Promise<FactoryCache> {
  try {
    // skipCompression: the cache holds tens of MB, compressed reads/writes take ~1 min
    const json = await sdk.cache.readCache(cacheFileKey(chain), { skipCompression: true } as any)
    if (!json || !Object.keys(json).length) throw new Error('no cached data')
    return json
  } catch (e) {
    return {} as FactoryCache
  }
}

async function writeFactoryCache(chain: string, cache: FactoryCache) {
  try {
    await sdk.cache.writeCache(cacheFileKey(chain), cache, { skipCompression: true } as any)
  } catch (e) {
    sdk.log(`[pons-v2] cache write failed: ${(e as any)?.message}`)
  }
}

// parsed once per process and per chain, shared between hourly slots
const cachePromises: { [chain: string]: Promise<FactoryCache> } = {}
function loadCache(chain: string): Promise<FactoryCache> {
  if (!cachePromises[chain]) cachePromises[chain] = (async () => {
    const t0 = Date.now()
    const cache = await readFactoryCache(chain)
    if (!cache.curves) cache.curves = {}
    if (!cache.poolIdToToken) cache.poolIdToToken = {}
    if (!cache.pendingPositions) cache.pendingPositions = {}
    sdk.log(`[pons-v2] cache loaded in ${elapsed(t0)}: ${Object.keys(cache.curves).length} curves, ${Object.keys(cache.poolIdToToken).length} pools, ${Object.keys(cache.pendingPositions).length} pending positions, lastBlock=${cache.lastBlock ?? 'none'}`)
    return cache
  })()
  return cachePromises[chain]
}

// the factory maps are persisted and only the block delta is synced each run;
// concurrent runs are serialized so the same delta is not synced twice
let syncChain: Promise<any> = Promise.resolve()
function updateFactoryCache(options: FetchOptions): Promise<FactoryCache> {
  const run = syncChain.then(() => doUpdateFactoryCache(options))
  syncChain = run.catch(() => { })
  return run
}

async function doUpdateFactoryCache(options: FetchOptions): Promise<FactoryCache> {
  const cache = await loadCache(options.chain)
  const chainId = Number(options.api.chainId)

  const toBlock = await options.getToBlock()
  const hasNewBlocks = toBlock > (cache.lastBlock ?? 0)

  if (hasNewBlocks) {
    let from = Math.max(FACTORY_DEPLOYED_BLOCK, (cache.lastBlock ?? FACTORY_DEPLOYED_BLOCK) - REORG_SAFETY_BLOCKS)
    while (from <= toBlock) {
      const to = Math.min(from + HISTORY_SYNC_BLOCK_RANGE - 1, toBlock)
      const t0 = Date.now()

      const [launched, graduated] = await Promise.all([
        queryClickhouse<any>(`
          SELECT
            concat('0x', substring(topic1, 27, 40)) AS token,
            concat('0x', substring(topic2, 27, 40)) AS curve,
            concat('0x', substring(data, 27, 40)) AS pairToken
          FROM evm_indexer.logs
          ${factoryLogsFilter(chainId, TOKEN_LAUNCHED_TOPIC0, from, to)}
        `, undefined, undefined, { chain: options.chain }),
        queryClickhouse<any>(`
          SELECT
            concat('0x', substring(topic1, 27, 40)) AS token,
            toString(reinterpretAsUInt256(reverse(unhex(substring(data, 3, 64))))) AS positionId
          FROM evm_indexer.logs
          ${factoryLogsFilter(chainId, POOL_GRADUATED_TOPIC0, from, to)}
        `, undefined, undefined, { chain: options.chain }),
      ])

      for (const { token, curve, pairToken } of launched)
        cache.curves[curve.toLowerCase()] = { token: token.toLowerCase(), pairToken: pairToken.toLowerCase() }

      for (const { token, positionId } of graduated) {
        if (!cache.pendingPositions[positionId]) cache.pendingPositions[positionId] = token.toLowerCase()
      }

      const tFetch = Date.now()
      cache.lastBlock = Math.max(cache.lastBlock ?? 0, to)
      await writeFactoryCache(options.chain, cache)
      sdk.log(`[pons-v2] factory sync ${from} -> ${to} (${toBlock - to} blocks remaining): ${launched.length} launches, ${graduated.length} graduations, query ${elapsed(t0)}, cache write ${elapsed(tFetch)}`)
      from = to + 1
    }
  }

  // poolIds are immutable: each graduated position is resolved once then cached
  const pendingIds = Object.keys(cache.pendingPositions)
  let resolvedCount = 0
  if (pendingIds.length) {
    const t0 = Date.now()
    const positionInfos = await options.api.multiCall({
      target: UNIV4_POOL_MANAGER,
      abi: POSITION_INFO_FUNCTION,
      calls: pendingIds,
      permitFailure: true,
    })
    pendingIds.forEach((positionId, i) => {
      const info = positionInfos[i]
      if (info == null) return
      const poolIdPrefix = ('0x' + BigInt(info).toString(16).padStart(64, '0').slice(0, 50)).toLowerCase()
      cache.poolIdToToken[poolIdPrefix] = cache.pendingPositions[positionId]
      delete cache.pendingPositions[positionId]
      resolvedCount++
    })
    sdk.log(`[pons-v2] resolved poolIds for ${resolvedCount}/${pendingIds.length} positions via positionInfo multicall in ${elapsed(t0)}`)
    if (resolvedCount && !hasNewBlocks) await writeFactoryCache(options.chain, cache)
  }

  return cache
}

type CurveSwapRow = {
  address: string
  topic0: string
  amount0: string
  amount1: string
  fee: string
  tax: string
}

// swaps are aggregated server-side, one row per (curve, buy/sell) comes back
async function getCurveSwapRows(options: FetchOptions): Promise<CurveSwapRow[]> {
  const fromBlock = await options.getFromBlock()
  const toBlock = await options.getToBlock()
  const t0 = Date.now()
  const rows: CurveSwapRow[] = await queryClickhouse<any>(`
    SELECT
      address,
      topic0,
      toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 3, 64)))))) AS amount0,
      toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 67, 64)))))) AS amount1,
      toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 131, 64)))))) AS fee,
      toString(SUM(reinterpretAsUInt256(reverse(unhex(substring(data, 195, 64)))))) AS tax
    FROM evm_indexer.logs
    PREWHERE chain = ${Number(options.api.chainId)}
      AND short_topic0 IN ('${CURVE_BUY_TOPIC0.substring(0, 10)}', '${CURVE_SELL_TOPIC0.substring(0, 10)}')
      AND topic0 IN ('${CURVE_BUY_TOPIC0}', '${CURVE_SELL_TOPIC0}')
      AND block_number >= ${fromBlock}
      AND block_number <= ${toBlock}
    GROUP BY address, topic0
  `, undefined, undefined, { chain: options.chain })
  sdk.log(`[pons-v2] curve swaps aggregated server-side: ${rows.length} (curve, side) rows in ${elapsed(t0)}`)
  return rows
}

async function getTodayLaunchCount(options: FetchOptions): Promise<number> {
  const fromBlock = await options.getFromBlock()
  const toBlock = await options.getToBlock()
  const rows = await queryClickhouse<any>(`
    SELECT count() AS n
    FROM evm_indexer.logs
    ${factoryLogsFilter(Number(options.api.chainId), TOKEN_LAUNCHED_TOPIC0, fromBlock, toBlock)}
  `, undefined, undefined, { chain: options.chain })
  return Number(rows[0]?.n ?? 0)
}

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const [{ curves, poolIdToToken }, launchesToday, curveSwapRows, poolFeeSweptLogs] = await Promise.all([
    updateFactoryCache(options),
    getTodayLaunchCount(options),
    getCurveSwapRows(options),
    options.getLogs({ target: MEME_HOOK, eventAbi: POOL_FEE_SWEPT_EVENT }),
  ])
  const tokenToPairToken = new Map<string, string>()
  for (const { token, pairToken } of Object.values(curves)) tokenToPairToken.set(token, pairToken)

  dailyFees.addGasToken(LAUNCH_FEE_WEI * launchesToday, "Launch Fees")
  dailyRevenue.addGasToken(LAUNCH_FEE_WEI * launchesToday, "Launch Fees to Protocol")

  const swaps: { curve: { token: string, pairToken: string }, row: CurveSwapRow }[] = []
  for (const row of curveSwapRows) {
    const curve = curves[row.address.toLowerCase()]
    if (curve) swaps.push({ curve, row })
  }

  // fee policies are only fetched for tokens that traded on their curve today
  const activeTokens = Array.from(new Set(swaps.map(({ curve }) => curve.token)))
  const tPolicies = Date.now()
  const launchFeePolicies = await options.api.multiCall({
    target: FACTORY,
    abi: LAUNCH_FEE_POLICY_FUNCTION,
    calls: activeTokens,
    permitFailure: true,
  })
  sdk.log(`[pons-v2] ${activeTokens.length} active tokens today, fee policies fetched in ${elapsed(tPolicies)}`)
  const tokenToLaunchFeePolicy = new Map<string, any>()
  activeTokens.forEach((token, i) => {
    if (launchFeePolicies[i] != null) tokenToLaunchFeePolicy.set(token, launchFeePolicies[i])
  })

  for (const { curve, row } of swaps) {
    const launchFeePolicy = tokenToLaunchFeePolicy.get(curve.token)
    if (!launchFeePolicy) continue

    const isBuy = row.topic0.toLowerCase() === CURVE_BUY_TOPIC0.toLowerCase()
    const quoteAmount = BigInt(isBuy ? row.amount0 : row.amount1) // quoteIn : quoteOut
    const fee = BigInt(row.fee)
    const tax = BigInt(row.tax)
    const { pairToken: quoteToken } = curve

    const BPS_TO_PROTOCOL = launchFeePolicy.protocolFeeShareBps
    const BPS_TO_CREATORS = (BPS - BPS_TO_PROTOCOL) / (BPS / (BPS - launchFeePolicy.buybackBurnBps))
    const BPS_TO_MEME_TOKEN_BUYBACK = BPS - BPS_TO_CREATORS - BPS_TO_PROTOCOL

    dailyVolume.add(quoteToken, isBuy ? quoteAmount : quoteAmount + fee + tax)
    dailyFees.add(quoteToken, fee + tax, "Curve Swap Fees")
    dailyRevenue.add(quoteToken, fee * BigInt(BPS_TO_PROTOCOL) / BigInt(BPS), "Curve Swap Fees to Protocol")
    dailySupplySideRevenue.add(quoteToken, fee * BigInt(Math.floor(BPS_TO_CREATORS)) / BigInt(BPS), "Curve Swap Fees to Creators")
    dailySupplySideRevenue.add(quoteToken, fee * BigInt(Math.floor(BPS_TO_MEME_TOKEN_BUYBACK)) / BigInt(BPS), "Curve Swap Fees to Meme Token Buybacks")
    dailySupplySideRevenue.add(quoteToken, tax, "Creator Tax")
  }

  sdk.log(`[pons-v2] ${poolFeeSweptLogs.length} PoolFeesSwept logs today`)
  for (const log of poolFeeSweptLogs) {
    const { protocolAmount, buybackAmount, creatorAmount, poolId } = log
    const token = poolIdToToken[poolId.slice(0, 52).toLowerCase()]
    if (!token) continue
    const pairToken = tokenToPairToken.get(token)
    if (!pairToken) continue

    dailyFees.add(pairToken, protocolAmount + buybackAmount + creatorAmount, METRIC.SWAP_FEES)
    dailyRevenue.add(pairToken, protocolAmount, "Token Swap Fees to Protocol")
    dailySupplySideRevenue.add(pairToken, creatorAmount, "Token Swap Fees to Creators")
    dailySupplySideRevenue.add(pairToken, buybackAmount, "Token Swap Fees to Meme Token Buybacks")
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  }

}

const methodology = {
  Volume: "Volume of all swaps on Pons' launch curve, external uniswap v4 swaps are excluded",
  Fees: "Includes launch fees, curve swap fees and swap fees post graduation (uniswap v4 : realised through fee swept events)",
  Revenue: "Includes all the launch fees and part of swap fees",
  SupplySideRevenue: "Includes swap fees to creators, taxes (optional) to creators and buybacks (if enabled by creators) of meme tokens"
}

const breakdownMethodology = {
  Fees: {
    "Launch Fees": "0.0005 ETH charged for each token launched",
    "Curve Swap Fees": "Fees and taxes collected from curve swaps on Pons' launch curve",
    [METRIC.SWAP_FEES]: "Fees and taxes collected from uniswap v4 swaps on graduated pools (realised through fee swept events)"
  },
  Revenue: {
    "Launch Fees to Protocol": "All the launch fees (0.0005 ETH per token launched) collected goes to the protocol",
    "Curve Swap Fees to Protocol": "Part of (30% for most pools) the curve swap fees collected goes to the protocol",
    "Token Swap Fees to Protocol": "Part of (30% for most pools) the uniswap v4 swap fees collected goes to the protocol",
  },
  SupplySideRevenue: {
    "Curve Swap Fees to Creators": "Part of (70% when buyback is disabled, 35% when buyback is enabled) the curve swap fees collected goes to the creators",
    "Token Swap Fees to Creators": "Part of (70% when buyback is disabled, 35% when buyback is enabled) the uniswap v4 swap fees collected goes to the creators",
    "Creator Tax": "Taxes collected from creators (if enabled) on curve swaps",
    "Token Swap Fees to Meme Token Buybacks": "Part of (0% when buyback is disabled, 35% when buyback is enabled) the uniswap v4 swap fees collected goes to the buyback and burning of meme tokens",
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  methodology,
  breakdownMethodology,
  start: "2026-08-03"
}

export default adapter;
