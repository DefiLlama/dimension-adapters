import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const FACTORY = "0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e"
const UNIV4_POOL_MANAGER = "0x58daec3116aae6D93017bAAea7749052E8a04fA7"
const MEME_HOOK = "0xE5e702641Ea86F4ae6cC3cDaeD2B886f976Be044"

const FACTORY_DEPLOYED_BLOCK = 26841846
const LAUNCH_FEE_WEI = 500000000000000
const BPS = 10000

const TOKEN_LAUNCHED_EVENT = "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold)"
const CURVE_BUY_EVENT = "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax)"
const CURVE_SELL_EVENT = "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut,  uint256 fee, uint256 tax)"
const POOL_GRADUATED_EVENT = "event PoolGraduated(address indexed token, uint256 positionId, uint256 tokenAmount, uint256 pairTokenAmount)"
const POOL_FEE_SWEPT_EVENT = "event PoolFeesSwept(bytes32 indexed poolId, uint256 protocolAmount, uint256 buybackAmount, uint256 creatorAmount, uint256 tokensLocked)"

const POSITION_INFO_FUNCTION = "function positionInfo(uint256 tokenId) view returns (uint256 info)"
const LAUNCH_FEE_POLICY_FUNCTION = "function getLaunchFeePolicy(address token) view returns (tuple(address protocolFeeRecipient, uint16 protocolFeeShareBps, uint16 buybackBurnBps, uint16 hookFeeBps, uint16 maxInternalPriceImpactBps))"

async function fetch(options: FetchOptions) {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const tokenLaunchedLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: TOKEN_LAUNCHED_EVENT,
    fromBlock: FACTORY_DEPLOYED_BLOCK,
    cacheInCloud: true,
  })

  const poolGraduatedLogs = await options.getLogs({
    target: FACTORY,
    eventAbi: POOL_GRADUATED_EVENT,
    fromBlock: FACTORY_DEPLOYED_BLOCK,
    cacheInCloud: true,
  })

  const tokenLaunchedLogsToday = await options.getLogs({
    target: FACTORY,
    eventAbi: TOKEN_LAUNCHED_EVENT,
  })

  const curveToTokens = new Map<string, { token: string, pairToken: string }>();
  const tokenToPairToken = new Map<string, string>()
  for (const log of tokenLaunchedLogs) {
    const { token, curve, pairToken } = log
    curveToTokens.set(curve.toLowerCase(), { token: token.toLowerCase(), pairToken: pairToken.toLowerCase() })
    tokenToPairToken.set(token.toLowerCase(), pairToken.toLowerCase())
  }

  const positionIdToTokens = new Map(poolGraduatedLogs.map(log => [log.positionId, log.token.toLowerCase()]));

  const curves = Array.from(curveToTokens.keys())
  const tokens = Array.from(curveToTokens.values()).map(token => token.token.toLowerCase())

  const curveBuyLogs = await options.getLogs({
    targets: curves,
    eventAbi: CURVE_BUY_EVENT,
    entireLog: true,
    parseLog: true,
  })

  const curveSellLogs = await options.getLogs({
    targets: curves,
    eventAbi: CURVE_SELL_EVENT,
    entireLog: true,
    parseLog: true,
  })

  const poolFeeSweptLogs = await options.getLogs({
    target: MEME_HOOK,
    eventAbi: POOL_FEE_SWEPT_EVENT,
  })

  const positionIds = Array.from(positionIdToTokens.keys())
  const positionInfos = await options.api.multiCall({
    target: UNIV4_POOL_MANAGER,
    abi: POSITION_INFO_FUNCTION,
    calls: positionIds,
  })

  const launchFeePolicies = await options.api.multiCall({
    target: FACTORY,
    abi: LAUNCH_FEE_POLICY_FUNCTION,
    calls: tokens,
  })

  const poolIdToTokens = new Map<string, string>()
  for (let i = 0; i < positionIds.length; i++) {
    const info = positionInfos[i]
    if (info == null) continue
    const poolId = '0x' + BigInt(info).toString(16).padStart(64, '0').slice(0, 50)
    const token = positionIdToTokens.get(positionIds[i])
    if (token) poolIdToTokens.set(poolId.toLowerCase(), token)
  }

  const tokenToLaunchFeePolicy = new Map<string, {
    protocolFeeRecipient: string
    protocolFeeShareBps: number
    buybackBurnBps: number
    hookFeeBps: number
    maxInternalPriceImpactBps: number
  }>()
  for (let i = 0; i < tokens.length; i++) {
    const policy = launchFeePolicies[i]
    if (policy == null) continue
    tokenToLaunchFeePolicy.set(tokens[i].toLowerCase(), policy)
  }

  dailyFees.addGasToken(LAUNCH_FEE_WEI * tokenLaunchedLogsToday.length, "Launch Fees")
  dailyRevenue.addGasToken(LAUNCH_FEE_WEI * tokenLaunchedLogsToday.length, "Launch Fees to Protocol")

  for (const log of curveBuyLogs) {
    const { quoteIn, fee, tax } = log.args
    const quoteToken = curveToTokens.get(log.address.toLowerCase())?.pairToken
    const token = curveToTokens.get(log.address.toLowerCase())?.token
    if (!quoteToken || !token) continue
    const launchFeePolicy = tokenToLaunchFeePolicy.get(token.toLowerCase())
    if (!launchFeePolicy) continue

    const BPS_TO_PROTOCOL = launchFeePolicy.protocolFeeShareBps
    const BPS_TO_CREATORS = (BPS - BPS_TO_PROTOCOL) / (BPS / (BPS - launchFeePolicy.buybackBurnBps))
    const BPS_TO_MEME_TOKEN_BUYBACK = BPS - BPS_TO_CREATORS - BPS_TO_PROTOCOL

    dailyVolume.add(quoteToken, quoteIn)
    dailyFees.add(quoteToken, fee + tax, "Curve Swap Fees")
    dailyRevenue.add(quoteToken, Number(fee) * launchFeePolicy.protocolFeeShareBps / BPS, "Curve Swap Fees to Protocol")
    dailySupplySideRevenue.add(quoteToken, Number(fee) * BPS_TO_CREATORS / BPS, "Curve Swap Fees to Creators")
    dailySupplySideRevenue.add(quoteToken, Number(fee) * BPS_TO_MEME_TOKEN_BUYBACK / BPS, "Curve Swap Fees to Meme Token Buybacks")
    dailySupplySideRevenue.add(quoteToken, tax, "Creator Tax")
  }

  for (const log of curveSellLogs) {
    const { quoteOut, fee, tax } = log.args
    const quoteToken = curveToTokens.get(log.address.toLowerCase())?.pairToken
    const token = curveToTokens.get(log.address.toLowerCase())?.token
    if (!quoteToken || !token) continue
    const launchFeePolicy = tokenToLaunchFeePolicy.get(token.toLowerCase())
    if (!launchFeePolicy) continue

    const BPS_TO_PROTOCOL = launchFeePolicy.protocolFeeShareBps
    const BPS_TO_CREATORS = (BPS - BPS_TO_PROTOCOL) / (BPS / (BPS - launchFeePolicy.buybackBurnBps))
    const BPS_TO_MEME_TOKEN_BUYBACK = BPS - BPS_TO_CREATORS - BPS_TO_PROTOCOL

    dailyVolume.add(quoteToken, quoteOut + fee + tax)
    dailyFees.add(quoteToken, fee + tax, "Curve Swap Fees")
    dailyRevenue.add(quoteToken, Number(fee) * BPS_TO_PROTOCOL / BPS, "Curve Swap Fees to Protocol")
    dailySupplySideRevenue.add(quoteToken, Number(fee) * BPS_TO_CREATORS / BPS, "Curve Swap Fees to Creators")
    dailySupplySideRevenue.add(quoteToken, Number(fee) * BPS_TO_MEME_TOKEN_BUYBACK / BPS, "Curve Swap Fees to Meme Token Buybacks")
    dailySupplySideRevenue.add(quoteToken, tax, "Creator Tax")
  }

  for (const log of poolFeeSweptLogs) {
    const { protocolAmount, buybackAmount, creatorAmount, poolId } = log
    const token = poolIdToTokens.get(poolId.slice(0, 52).toLowerCase())
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