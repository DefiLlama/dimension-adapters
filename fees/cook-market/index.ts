import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

// Cook Market launchpad on Robinhood Chain, every launch is a Uniswap v4 pool guarded by CookHook
// which serves both the bonding-curve and the post-graduation phase
const FACTORY = "0x059bCe487C6be54CEb4E79C60a6D95F9119732dc"
const COOK_HOOK = "0xfe3eFA722DCAB53e87E94593cB41Bc706C1E3044"

const FACTORY_DEPLOYED_BLOCK = 57700000
const BPS = 10000n
const GRADUATED_PROGRESS_BPS = 10000

// Pons v2 shape for the first six fields, Cook extras appended
const TOKEN_LAUNCHED_EVENT = "event TokenLaunched(address indexed token, address indexed curve, address indexed deployer, address pairToken, uint256 launchConfigId, uint256 graduationThreshold, bytes32 poolId, uint256 mainBandTokenId, uint256 tailBandTokenId, string name, string symbol, uint256 totalSupply, uint128 startAmount, uint16 taxBps, uint8 baseDecimals)"
// amounts are pool-side and gross of the hook cut, fee / tax are in the swap's unspecified leg
const CURVE_BUY_EVENT = "event CurveBuy(address indexed buyer, address indexed recipient, uint256 quoteIn, uint256 tokensOut, uint256 fee, uint256 tax, bytes32 indexed poolId, address token, uint16 progressBps)"
const CURVE_SELL_EVENT = "event CurveSell(address indexed seller, address indexed recipient, uint256 tokensIn, uint256 quoteOut, uint256 fee, uint256 tax, bytes32 indexed poolId, address token, uint16 progressBps)"
// emitted right before each CurveBuy / CurveSell in the same tx, tells which currency the cut was taken in
const HOOK_FEE_COLLECTED_EVENT = "event HookFeeCollected(bytes32 indexed poolId, address currency, uint256 feeAmount, uint256 taxAmount)"

const PROTOCOL_FEE_SHARE_BPS_FUNCTION = "function protocolFeeShareBps() view returns (uint16)"

type Launch = { token: string, pairToken: string }

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

  const poolIdToLaunch = new Map<string, Launch>()
  for (const log of tokenLaunchedLogs) {
    poolIdToLaunch.set(String(log.poolId).toLowerCase(), {
      token: log.token.toLowerCase(),
      pairToken: log.pairToken.toLowerCase(),
    })
  }
  if (!poolIdToLaunch.size) return { dailyVolume, dailyFees, dailyRevenue, dailySupplySideRevenue }

  // protocol share of the swap fee in bps, the rest of the fee and all of the tax go to the creator
  const protocolShareBps = BigInt(await options.api.call({ target: COOK_HOOK, abi: PROTOCOL_FEE_SHARE_BPS_FUNCTION }))
  const creatorShareBps = BPS - protocolShareBps

  const [curveBuyLogs, curveSellLogs, hookFeeCollectedLogs] = await Promise.all([
    options.getLogs({ target: COOK_HOOK, eventAbi: CURVE_BUY_EVENT, entireLog: true }),
    options.getLogs({ target: COOK_HOOK, eventAbi: CURVE_SELL_EVENT, entireLog: true }),
    options.getLogs({ target: COOK_HOOK, eventAbi: HOOK_FEE_COLLECTED_EVENT, entireLog: true }),
  ])

  // pair each swap with its HookFeeCollected: same tx, same pool, in log order
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

    // fallback to pair token when no HookFeeCollected is found
    const feeCurrency = feeCurrencyQueue.get(txPoolKey(log, poolId))?.shift() ?? launch.pairToken
    if (feeCurrency === launch.token) {
      // cut taken in the launched token, value it at this swap's execution price
      if (tokenAmount === 0n) continue
      fee = fee * quoteAmount / tokenAmount
      tax = tax * quoteAmount / tokenAmount
    }

    const isGraduated = Number(args.progressBps) >= GRADUATED_PROGRESS_BPS
    const phase = isGraduated ? "Token" : "Curve"
    const feeLabel = isGraduated ? METRIC.SWAP_FEES : "Curve Swap Fees"

    dailyVolume.add(launch.pairToken, quoteAmount)
    dailyFees.add(launch.pairToken, fee + tax, feeLabel)
    dailyRevenue.add(launch.pairToken, fee * protocolShareBps / BPS, `${phase} Swap Fees to Protocol`)
    dailySupplySideRevenue.add(launch.pairToken, fee * creatorShareBps / BPS, `${phase} Swap Fees to Creators`)
    dailySupplySideRevenue.add(launch.pairToken, tax, "Creator Tax")
  }

  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: "Volume of all swaps on Cook Market launched pools (bonding-curve phase and post-graduation), measured in the pool's pair token",
  Fees: "Swap fees (1% of the swap) and optional creator tax charged by the Cook hook on every swap, before and after graduation, there is no launch fee",
  Revenue: "Part of the swap fees (protocolFeeShareBps, 10% at launch) sent to the Cook treasury",
  SupplySideRevenue: "Remaining swap fees and 100% of the creator tax paid to token creators",
}

const breakdownMethodology = {
  Fees: {
    "Curve Swap Fees": "Fees and taxes collected from swaps while the pool is still in its bonding-curve phase",
    [METRIC.SWAP_FEES]: "Fees and taxes collected from swaps on graduated pools",
  },
  Revenue: {
    "Curve Swap Fees to Protocol": "Part of (protocolFeeShareBps, 10% at launch) the curve swap fees collected goes to the protocol treasury",
    "Token Swap Fees to Protocol": "Part of (protocolFeeShareBps, 10% at launch) the graduated pool swap fees collected goes to the protocol treasury",
  },
  SupplySideRevenue: {
    "Curve Swap Fees to Creators": "Part of (90% at launch) the curve swap fees collected goes to the creators",
    "Token Swap Fees to Creators": "Part of (90% at launch) the graduated pool swap fees collected goes to the creators",
    "Creator Tax": "Optional tax (0-10%, chosen per launch) on every swap, paid entirely to the creator",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ROBINHOOD],
  methodology,
  breakdownMethodology,
  start: "2026-09-08",
  doublecounted: true, // uniswap v4 pools, already counted by the uniswap-v4 adapter
}

export default adapter;
