import ADDRESSES from "../helpers/coreAssets.json"
import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"

const USDC = ADDRESSES.rise.USDC
// docs.risechain.com/docs/risex/contracts/deployments
const FEE_MANAGER = "0x11541dc387b9C307043ea732127DF92b80bab52b"
const PERPS_MANAGER = "0x53f10fAcFC8965750494E6965F5d6dA39B41d852".toLowerCase()

// treasury-funded referral and affiliate commission payouts, source 0 = commissions
const PAYOUTS = "0x529c6e2838164331053ec6bb49c529ecb79a5cea"
const REFERRAL_SOURCE = 0n

// default queue of the XLP vault 0xBCf7A882B6A95827B4996055a5018FdC3B95D40c, each strategy takes a 20% performance fee
const XLP_STRATEGIES = [
  "0x3C63b0A9ba081BD1B709Ac1a2B56B50c2E810972", // market making
  "0xA71035028E8a6440e0311963DF83cC63316B07CB", // RWA market making
  "0xEF5c778b2DcBb48E7F4a7Ac48EAdBAf256425193", // liquidation
]

// fee events use 18 decimals, USDC.e transfers and strategy reports 6
const WAD_TO_USDC = 10n ** 12n

// fee counter is readable, and 0, from this block
const COUNTER_START_BLOCK = 7345400
const COUNTER_ABI = "function getTotalFeesCollected(address protocol, address token) view returns (uint256)"

// small ranges keep each getLogs call under the RISE RPC result cap at peak density
const EVENTS = {
  collected: { maxBlockRange: 50, eventAbi: "event CollectedFees(address indexed protocol, address indexed token, uint256 amount)" },
  deducted: { maxBlockRange: 100, eventAbi: "event DeductedFees(address indexed protocol, address indexed token, uint256 amount)" },
  builder: { maxBlockRange: 200, eventAbi: "event CollectedBuilderFees(uint16 indexed builderId, address indexed token, uint256 amount)" },
  liquidation: { maxBlockRange: 200, eventAbi: "event CollectedLiquidationFees(address indexed protocol, address indexed token, address indexed recipient, uint256 amount)" },
  withdraw: { maxBlockRange: 500, eventAbi: "event WithdrawTradingFees(address indexed protocol, address indexed sender, address indexed token, uint256 amount, address to)" },
  payout: { maxBlockRange: 500, eventAbi: "event PayoutCredited(bytes32 indexed payoutId, address indexed account, address indexed token, uint256 amount, uint8 source, bytes32 reference, bytes32 data, address operator)" },
}
const REPORTED_ABI = "event Reported(uint256 profit, uint256 loss, uint256 protocolFees, uint256 performanceFees)"

type Destination = "protocol" | "xlp"
const LIQUIDATION_FEE_RECIPIENTS: Record<string, Destination> = {
  "0xa51c3d367e895988232750d297d8904cd712ab91": "xlp", // XLP liquidation strategy account
  "0x695d0af9b7cc595037ff89ed4d510d0624fbcfa1": "protocol", // RISEx Safe with the treasury's owners
  [ADDRESSES.null]: "protocol",
}

const LABELS = {
  TRADING_FEES: METRIC.TRADING_FEES,
  BUILDER_FEES: "Builder Code Fees",
  LIQUIDATION_FEES: METRIC.LIQUIDATION_FEES,
  PERFORMANCE_FEES: METRIC.PERFORMANCE_FEES,
  BUILDER_FEES_TO_BUILDERS: "Builder Code Fees To Builders",
  LIQUIDATION_FEES_TO_XLP: "Liquidation Fees To XLP Vault",
  TRADING_FEES_TO_REFERRERS: "Trading Fees To Referrers",
  TRADING_FEES_TO_PROTOCOL: "Trading Fees To Protocol",
  LIQUIDATION_FEES_TO_PROTOCOL: "Liquidation Fees To Protocol",
  PERFORMANCE_FEES_TO_PROTOCOL: "Performance Fees To Protocol",
}

const isPerps = (log: any) => log.protocol.toLowerCase() === PERPS_MANAGER
const isReferral = (log: any) => BigInt(log.source) === REFERRAL_SOURCE
const sumAmounts = (logs: any[], filter = (_log: any) => true) =>
  logs.filter(filter).reduce((sum: bigint, log: any) => sum + BigInt(log.amount), 0n)

const sumLiquidation = (logs: any[]) => {
  const sums: Record<Destination, bigint> = { protocol: 0n, xlp: 0n }
  for (const log of logs) {
    const destination = LIQUIDATION_FEE_RECIPIENTS[log.recipient.toLowerCase()]
    if (!destination) throw new Error(`RISEx liquidation fee to unknown recipient ${log.recipient}`)
    sums[destination] += BigInt(log.amount)
  }
  return sums
}

const readCounter = async (api: any, block: number): Promise<bigint> => {
  if (block < COUNTER_START_BLOCK) return 0n
  return BigInt(await api.call({ target: FEE_MANAGER, abi: COUNTER_ABI, params: [PERPS_MANAGER, USDC] }))
}

const fetch = async (options: FetchOptions) => {
  const fromBlock = await options.getFromBlock()
  const toBlock = await options.getToBlock()

  const getLogs = ({ eventAbi, maxBlockRange }: { eventAbi: string, maxBlockRange: number }, target = FEE_MANAGER) =>
    options.getLogs({ target, eventAbi, maxBlockRange })
  const [collectedLogs, deductedLogs, builderLogs, liquidationLogs, withdrawLogs, payoutLogs, reportLogs, counterBefore, counterAfter] = await Promise.all([
    getLogs(EVENTS.collected),
    getLogs(EVENTS.deducted),
    getLogs(EVENTS.builder),
    getLogs(EVENTS.liquidation),
    getLogs(EVENTS.withdraw),
    getLogs(EVENTS.payout, PAYOUTS),
    options.getLogs({ targets: XLP_STRATEGIES, eventAbi: REPORTED_ABI }),
    readCounter(options.fromApi, fromBlock - 1),
    readCounter(options.toApi, toBlock),
  ])

  const collected = sumAmounts(collectedLogs, isPerps)
  // maker rebates go to RISEx's market-making Safe 0x36Dc0d99DCaEe443cEbaa5FB8c11877d157C26df (treasury owners), so they stay in revenue
  const rebates = sumAmounts(deductedLogs, isPerps)
  const withdrawn = sumAmounts(withdrawLogs, isPerps) * WAD_TO_USDC
  // a counter mismatch means truncated logs
  if (counterAfter - counterBefore !== collected - rebates - withdrawn)
    throw new Error(`RISEx fee logs incomplete in blocks ${fromBlock}-${toBlock}: counter moved ${counterAfter - counterBefore}, logs give ${collected - rebates - withdrawn}`)

  const tradingFees = collected / WAD_TO_USDC
  const builderFees = sumAmounts(builderLogs) / WAD_TO_USDC
  const liquidation = sumLiquidation(liquidationLogs)
  const liquidationToProtocol = liquidation.protocol / WAD_TO_USDC
  const liquidationToXlp = liquidation.xlp / WAD_TO_USDC
  const referrals = sumAmounts(payoutLogs, isReferral)
  const performanceFees = reportLogs.reduce((sum: bigint, log: any) => sum + BigInt(log.performanceFees), 0n)

  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()

  dailyFees.add(USDC, tradingFees, LABELS.TRADING_FEES)
  dailyFees.add(USDC, builderFees, LABELS.BUILDER_FEES)
  dailyFees.add(USDC, liquidationToProtocol + liquidationToXlp, LABELS.LIQUIDATION_FEES)
  dailyFees.add(USDC, performanceFees, LABELS.PERFORMANCE_FEES)

  dailySupplySideRevenue.add(USDC, builderFees, LABELS.BUILDER_FEES_TO_BUILDERS)
  dailySupplySideRevenue.add(USDC, liquidationToXlp, LABELS.LIQUIDATION_FEES_TO_XLP)
  dailySupplySideRevenue.add(USDC, referrals, LABELS.TRADING_FEES_TO_REFERRERS)

  dailyRevenue.add(USDC, tradingFees - referrals, LABELS.TRADING_FEES_TO_PROTOCOL)
  dailyRevenue.add(USDC, liquidationToProtocol, LABELS.LIQUIDATION_FEES_TO_PROTOCOL)
  dailyRevenue.add(USDC, performanceFees, LABELS.PERFORMANCE_FEES_TO_PROTOCOL)

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const methodology = {
  Fees: "Trading fees paid by takers and makers on RISEx perpetuals, builder code fees that front-ends charge on top, 1% liquidation fees, and the 20% performance fee RISEx takes from the profits of the XLP vault strategies.",
  Revenue: "Trading fees kept by RISEx after referral and affiliate commissions, liquidation fees sent to the RISEx multisig since 29 Oct 2026, and the 20% performance fee on XLP vault strategy profits. Maker rebates are not deducted because they are paid to RISEx's own market-making Safe.",
  ProtocolRevenue: "Trading fees kept by RISEx after referral and affiliate commissions, liquidation fees sent to the RISEx multisig since 29 Oct 2026, and the 20% performance fee on XLP vault strategy profits. Maker rebates are not deducted because they are paid to RISEx's own market-making Safe.",
  SupplySideRevenue: "Builder code fees paid to the front-ends that routed the orders, liquidation fees paid to the XLP vault's liquidation account until 29 Oct 2026, and referral and affiliate commissions credited by RISEx's payout contract since 30 Sep 2026.",
}

const breakdownMethodology = {
  Fees: {
    [LABELS.TRADING_FEES]: "Taker and maker fees collected by RISEx on perpetual fills, excluding builder code fees. Until 10 Apr 2026 liquidation fees were collected here too.",
    [LABELS.BUILDER_FEES]: "Fees charged on top of RISEx fees by the front-end (builder code) that routed the order.",
    [LABELS.LIQUIDATION_FEES]: "1% fee on positions closed by partial liquidation.",
    [LABELS.PERFORMANCE_FEES]: "20% of the profit reported by the XLP vault's market-making, RWA market-making and liquidation strategies, paid by XLP depositors.",
  },
  SupplySideRevenue: {
    [LABELS.BUILDER_FEES_TO_BUILDERS]: "Builder code fees credited to each builder's fee recipient.",
    [LABELS.LIQUIDATION_FEES_TO_XLP]: "Liquidation fees credited to the account of the XLP vault's liquidation strategy, until 29 Oct 2026.",
    [LABELS.TRADING_FEES_TO_REFERRERS]: "Referral and affiliate commissions credited to referrers' RISEx balances by the treasury-funded payout contract, counted when paid (claims are weekly).",
  },
  Revenue: {
    [LABELS.TRADING_FEES_TO_PROTOCOL]: "Trading fees accrued to the RISEx protocol fee vault, net of referral and affiliate commissions paid that period. Maker rebates paid from it since 15 Sep 2026 go to RISEx's own market-making Safe, so they stay in revenue.",
    [LABELS.LIQUIDATION_FEES_TO_PROTOCOL]: "Liquidation fees credited to the RISEx multisig, since 29 Oct 2026.",
    [LABELS.PERFORMANCE_FEES_TO_PROTOCOL]: "XLP strategy performance fees paid to RISEx's fee recipient contract.",
  },
  ProtocolRevenue: {
    [LABELS.TRADING_FEES_TO_PROTOCOL]: "Trading fees accrued to the RISEx protocol fee vault, net of referral and affiliate commissions paid that period. Maker rebates paid from it since 15 Sep 2026 go to RISEx's own market-making Safe, so they stay in revenue.",
    [LABELS.LIQUIDATION_FEES_TO_PROTOCOL]: "Liquidation fees credited to the RISEx multisig, since 29 Oct 2026.",
    [LABELS.PERFORMANCE_FEES_TO_PROTOCOL]: "XLP strategy performance fees paid to RISEx's fee recipient contract.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.RISE],
  start: "2026-03-31",
  methodology,
  breakdownMethodology,
  // commissions are booked when paid and can exceed a period's trading fees
  allowNegativeValue: true,
}

export default adapter
