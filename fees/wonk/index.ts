import { ChainApi } from "@defillama/sdk";
import { concat, keccak256, toBeHex, zeroPadValue } from "ethers";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Wonk Fun (wonk.fun) - bonding-curve launchpad on a dedicated Uniswap v4 hook, on Arc.
// Launches come from the factory; every swap, before and after graduation, runs through the hook.
// WonkLauncherFactory: https://explorer.arc.io/address/0x34f3DA4D04394173DED7b0f430af114a0fF27952
const FACTORY = "0x34f3DA4D04394173DED7b0f430af114a0fF27952"
// WonkHook: https://explorer.arc.io/address/0x21bdc377265e2A26ba336F24381E67e768253044
const WONK_HOOK = "0x21bdc377265e2A26ba336F24381E67e768253044"

// the factory's first TokenLaunched
const FACTORY_DEPLOYED_BLOCK = 21294374
// the hook denominates every fee share in basis points
const BPS = 10000n
// progressBps is base raised towards the graduation threshold; 10000 means the pool has graduated
const GRADUATED_PROGRESS_BPS = 10000
// Native USDC (18 decimals at the EVM level) is booked with addGasToken.
const NATIVE = "0x0000000000000000000000000000000000000000"

// WONK is the launchpad's own token and the second whitelisted base. It has no listed price, so
// balances booked in it would be dropped; its launches are valued through the WONK/native-USDC
// pool instead. Both sides are 18 decimals, so the pool's price needs no decimal scaling.
const WONK = "0x548df4bf91624d8cec46d606211eb13f7492e27e"
const WONK_USDC_POOL_ID = "0x86bbf4b57ee899dfa5eb9f948b28f287d0d7987b96a3738abde25e1f53f78e52"
// canonical Uniswap v4 PoolManager on Arc, shared with the uniswap-v4 adapter
const POOL_MANAGER = "0x8366a39CC670B4001A1121B8F6A443A643e40951"
const V4_SWAP_EVENT = "event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)"
const V4_SWAP_TOPIC = "0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f"
const EXTSLOAD_ABI = "function extsload(bytes32 slot) view returns (bytes32)"
// PoolManager.pools lives at storage slot 6; slot0 is the mapping value's first word
const POOLS_SLOT = 6n
const Q96 = 2 ** 96

// one per launch; `pairToken` is the base asset the pool quotes in
const TOKEN_LAUNCHED_EVENT = "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold, bytes32 poolId, uint256 mainBandTokenId, uint256 tailBandTokenId, string name, string symbol, uint256 totalSupply, uint128 startAmount, uint16 taxBps, uint8 baseDecimals)"
// Amounts are pool-side and gross of the hook cut. `fee` and `tax` are charged on the swap's
// unspecified leg, so they are denominated in either the pair token or the launched token.
const CURVE_BUY_EVENT = "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax, bytes32 indexed poolId, address token, uint16 progressBps)"
const CURVE_SELL_EVENT = "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax, bytes32 indexed poolId, address token, uint16 progressBps)"
// precedes the CurveBuy/CurveSell of the same swap and names the currency the cut landed in
const HOOK_FEE_COLLECTED_EVENT = "event HookFeeCollected(bytes32 indexed poolId, address currency, uint256 feeAmount, uint256 taxAmount)"

// The protocol's share of the swap fee is owner-settable, so reading it live would misprice
// older windows.
const PROTOCOL_FEE_SHARE_UPDATED_EVENT = "event ProtocolFeeShareUpdated(uint256 bps)"
const PROTOCOL_FEE_SHARE_BPS_FUNCTION = "function protocolFeeShareBps() view returns (uint16)"

type Launch = { token: string, pairToken: string }

// USDC per WONK over the window, as (block, logIndex, price) in log order. Built from the WONK/USDC
// pool's own swaps so each launch is valued at the rate that stood when it traded, and anchored at
// the window's opening price for the stretch before the pool's first swap of the window. The price
// a swap sees is the one left by the last WONK/USDC swap logged before it, which is why the
// position matters: that pool often trades several times per block, moving the rate as it goes.
async function getWonkPrices(options: FetchOptions, beforeWindow: ChainApi) {
  // Native USDC sorts below WONK, so it is currency0 and the pool price is WONK per USDC; the
  // reciprocal is what values a WONK amount. Verified against slot 6 of the pool manager, which
  // returns the same sqrtPriceX96 and tick as the pool's own Swap event.
  const priceFromSqrt = (sqrtPriceX96: bigint) => {
    const sqrtPrice = Number(sqrtPriceX96) / Q96
    const wonkPerUsdc = sqrtPrice * sqrtPrice
    return wonkPerUsdc > 0 ? 1 / wonkPerUsdc : 0
  }

  const slot = keccak256(concat([WONK_USDC_POOL_ID, zeroPadValue(toBeHex(POOLS_SLOT), 32)]))
  const openingSlot0 = await beforeWindow.call({ target: POOL_MANAGER, abi: EXTSLOAD_ABI, params: [slot] })
  const opening = priceFromSqrt(BigInt(openingSlot0) & ((1n << 160n) - 1n))

  const swaps = await options.getLogs({
    target: POOL_MANAGER,
    eventAbi: V4_SWAP_EVENT,
    topics: [V4_SWAP_TOPIC, WONK_USDC_POOL_ID],
    entireLog: true,
  })

  return [{ block: 0, logIndex: 0, price: opening }].concat(
    swaps
      .map((log: any) => ({
        block: Number(log.blockNumber),
        logIndex: Number(log.logIndex),
        price: priceFromSqrt(BigInt((log.args ?? log).sqrtPriceX96)),
      }))
      .sort((a: any, b: any) => (a.block - b.block) || (a.logIndex - b.logIndex))
  )
}

// Launches are resolved first so every swap maps back to its pool's pair token. A cut landing in
// the launched token is converted at that swap's own execution price, so no price feed is needed.
async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()

  const tokenLaunchedLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: TOKEN_LAUNCHED_EVENT,
    fromBlock: FACTORY_DEPLOYED_BLOCK,
    cacheInCloud: true,
  })

  const poolIdToLaunch = new Map<string, Launch>()
  for (const log of tokenLaunchedLogs) {
    poolIdToLaunch.set(String(log.poolId).toLowerCase(), {
      token: log.token.toLowerCase(),
      pairToken: log.pairToken.toLowerCase(),
    })
  }
  if (!poolIdToLaunch.size) return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue, dailyProtocolRevenue }

  // Both anchors below read state as of the block before the window, because getLogs includes
  // fromBlock: a read at fromBlock itself already reflects updates logged inside the window, which
  // would apply them to swaps that ran before them.
  const beforeWindow = new ChainApi({ chain: options.chain, block: await options.getFromBlock() - 1 })

  const hasWonkBase = [...poolIdToLaunch.values()].some(launch => launch.pairToken === WONK)
  const wonkPrices = hasWonkBase ? await getWonkPrices(options, beforeWindow) : []
  // the last WONK price quoted at or before the swap's own log position
  const wonkPriceAt = (block: number, logIndex: number) => {
    let price = 0
    for (const entry of wonkPrices) {
      if (entry.block > block || (entry.block === block && entry.logIndex > logIndex)) break
      price = entry.price
    }
    return price
  }

  // Anchored to the share in force when the window opened, read at that block rather than live, so
  // replaying an old window still splits at the rate that applied then.
  const openingShareBps = BigInt(await beforeWindow.call({ target: WONK_HOOK, abi: PROTOCOL_FEE_SHARE_BPS_FUNCTION }))
  // An update logged inside the window re-points the share from its own log position onwards. The
  // setter emits before it stores, so a swap logged earlier in the same block still used the old share.
  const shareUpdateLogs = await options.getLogs({
    target: WONK_HOOK,
    eventAbi: PROTOCOL_FEE_SHARE_UPDATED_EVENT,
    entireLog: true,
  })
  const shareHistory = [{ block: 0, logIndex: 0, bps: openingShareBps }].concat(
    shareUpdateLogs
      .map((log: any) => ({
        block: Number(log.blockNumber),
        logIndex: Number(log.logIndex),
        bps: BigInt((log.args ?? log).bps),
      }))
      .sort((a: any, b: any) => (a.block - b.block) || (a.logIndex - b.logIndex))
  )
  // the last share set at or before the swap's own log position
  const protocolShareAt = (block: number, logIndex: number) => {
    let bps = shareHistory[0].bps
    for (const entry of shareHistory) {
      if (entry.block > block || (entry.block === block && entry.logIndex > logIndex)) break
      bps = entry.bps
    }
    return bps
  }

  const curveBuyLogs = await options.getLogs({ target: WONK_HOOK, eventAbi: CURVE_BUY_EVENT, entireLog: true })
  const curveSellLogs = await options.getLogs({ target: WONK_HOOK, eventAbi: CURVE_SELL_EVENT, entireLog: true })
  const hookFeeCollectedLogs = await options.getLogs({ target: WONK_HOOK, eventAbi: HOOK_FEE_COLLECTED_EVENT, entireLog: true })

  const feeCurrencyQueue = new Map<string, string[]>()
  const txPoolKey = (log: any, poolId: string) => `${String(log.transactionHash).toLowerCase()}:${poolId}`
  const byLogIndex = (a: any, b: any) => (a.blockNumber - b.blockNumber) || (a.logIndex - b.logIndex)

  for (const log of [...hookFeeCollectedLogs].sort(byLogIndex)) {
    const args = log.args ?? log
    const key = txPoolKey(log, String(args.poolId).toLowerCase())
    if (!feeCurrencyQueue.has(key)) feeCurrencyQueue.set(key, [])
    feeCurrencyQueue.get(key)!.push(String(args.currency).toLowerCase())
  }

  const swaps = [
    ...curveBuyLogs.map((log: any) => ({ log, isBuy: true })),
    ...curveSellLogs.map((log: any) => ({ log, isBuy: false })),
  ].sort((a, b) => byLogIndex(a.log, b.log))

  for (const { log, isBuy } of swaps) {
    const args = log.args ?? log
    const poolId = String(args.poolId).toLowerCase()
    const launch = poolIdToLaunch.get(poolId)
    if (!launch) continue

    const quoteAmount = BigInt(isBuy ? args.quoteIn : args.quoteOut)
    const tokenAmount = BigInt(isBuy ? args.tokensOut : args.tokensIn)
    let fee = BigInt(args.fee)
    let tax = BigInt(args.tax)

    const feeCurrency = feeCurrencyQueue.get(txPoolKey(log, poolId))?.shift() ?? launch.pairToken
    if (feeCurrency === launch.token) {
      if (tokenAmount === 0n) continue
      fee = fee * quoteAmount / tokenAmount
      tax = tax * quoteAmount / tokenAmount
    }

    const isGraduated = Number(args.progressBps) >= GRADUATED_PROGRESS_BPS
    const phase = isGraduated ? "Token" : "Curve"
    const feeLabel = isGraduated ? METRIC.SWAP_FEES : "Curve Swap Fees"

    // split once and give the creator the remainder, so dailyFees stays exactly equal to
    // dailyRevenue + dailySupplySideRevenue
    const protocolCut = fee * protocolShareAt(Number(log.blockNumber), Number(log.logIndex)) / BPS
    const creatorCut = fee - protocolCut

    const wonkPrice = launch.pairToken === WONK ? wonkPriceAt(Number(log.blockNumber), Number(log.logIndex)) : 0
    const addAmount = (balances: typeof dailyVolume, amount: bigint, label?: string) => {
      if (launch.pairToken === NATIVE) balances.addGasToken(amount, label)
      // WONK has no listed price, so it is valued through its own USDC pool and booked in USD
      else if (launch.pairToken === WONK) balances.addUSDValue(Number(amount) / 1e18 * wonkPrice, label)
      else balances.add(launch.pairToken, amount, label)
    }

    addAmount(dailyVolume, quoteAmount)
    addAmount(dailyFees, fee + tax, feeLabel)
    addAmount(dailyRevenue, protocolCut, `${phase} Swap Fees to Protocol`)
    addAmount(dailyProtocolRevenue, protocolCut, `${phase} Swap Fees to Protocol`)
    addAmount(dailySupplySideRevenue, creatorCut, `${phase} Swap Fees to Creators`)
    addAmount(dailySupplySideRevenue, tax, "Creator Tax")
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
    dailyProtocolRevenue,
  }
}

const methodology = {
  Volume: "Volume of all swaps on Wonk Fun launched pools (bonding-curve phase and post-graduation), measured in the pool's pair token (base)",
  Fees: "Swap fees (currently 1% of the swap) and optional creator tax charged by the Wonk Fun hook on every swap, before and after graduation, there is no launch fee",
  Revenue: "protocolFeeShareBps of the swap fees sent to the Wonk Fun treasury, currently 1%",
  ProtocolRevenue: "All revenue goes to the Wonk Fun treasury, there is no token holder distribution",
  SupplySideRevenue: "Remaining swap fees and 100% of the creator tax paid to token creators",
}

const breakdownMethodology = {
  Fees: {
    "Curve Swap Fees": "Fees and taxes collected from swaps while the pool is still in its bonding-curve phase",
    [METRIC.SWAP_FEES]: "Fees and taxes collected from swaps on graduated pools",
  },
  Revenue: {
    "Curve Swap Fees to Protocol": "protocolFeeShareBps of the curve swap fees, currently 1%",
    "Token Swap Fees to Protocol": "protocolFeeShareBps of the graduated pool swap fees, currently 1%",
  },
  ProtocolRevenue: {
    "Curve Swap Fees to Protocol": "protocolFeeShareBps of the curve swap fees, currently 1%",
    "Token Swap Fees to Protocol": "protocolFeeShareBps of the graduated pool swap fees, currently 1%",
  },
  SupplySideRevenue: {
    "Curve Swap Fees to Creators": "The rest of the curve swap fees, currently 99%",
    "Token Swap Fees to Creators": "The rest of the graduated pool swap fees, currently 99%",
    "Creator Tax": "Optional tax (0-10%, chosen per launch) on every swap, paid entirely to the creator",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARC],
  methodology,
  breakdownMethodology,
  start: "2026-09-17",
  // these are Uniswap v4 pools, already counted by the uniswap-v4 adapter on Arc
  doublecounted: true,
}

export default adapter;
