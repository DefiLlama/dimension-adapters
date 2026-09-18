import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Wonk Fun (wonk.fun) - bonding-curve launchpad on a dedicated Uniswap v4 hook, on Arc.
// Launches come from the factory; every swap, before and after graduation, runs through the hook.
// WonkLauncherFactory: https://explorer.arc.io/address/0x34f3DA4D04394173DED7b0f430af114a0fF27952
const FACTORY = "0x34f3DA4D04394173DED7b0f430af114a0fF27952"
// WonkHook: https://explorer.arc.io/address/0x21bdc377265e2A26ba336F24381E67e768253044
const WONK_HOOK = "0x21bdc377265e2A26ba336F24381E67e768253044"

const FACTORY_DEPLOYED_BLOCK = 21260000
const BPS = 10000n
// progressBps is base raised towards the graduation threshold; 10000 means the pool has graduated
const GRADUATED_PROGRESS_BPS = 10000
// The registry whitelists only native USDC (18 decimals), so pair tokens are booked with
// addGasToken; the branch below covers an ERC-20 base being whitelisted later.
const NATIVE = "0x0000000000000000000000000000000000000000"

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

  // Anchored to the share in force when the window opened, read at that block rather than live, so
  // replaying an old window still splits at the rate that applied then.
  const openingShareBps = BigInt(await options.fromApi.call({ target: WONK_HOOK, abi: PROTOCOL_FEE_SHARE_BPS_FUNCTION }))
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

    const addAmount = (balances: typeof dailyVolume, amount: bigint, label?: string) => {
      if (launch.pairToken === NATIVE) balances.addGasToken(amount, label)
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
