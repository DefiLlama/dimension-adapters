import { FetchOptions, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains"
import { METRIC } from "../helpers/metrics"

// docs.risechain.com/docs/risex/contracts/deployments
const FEE_MANAGER = "0x11541dc387b9C307043ea732127DF92b80bab52b"
const PERPS_MANAGER = "0x53f10fAcFC8965750494E6965F5d6dA39B41d852".toLowerCase()
// api.rise.trade/api/v1/system/config
const USDC = "0xe436820ba0c69702c1d3e601d421c0ef38262739"

// treasury-funded referral and affiliate commission payouts
const PAYOUTS = "0x529c6e2838164331053ec6bb49c529ecb79a5cea"
// source 1 (from 2026-11-19) is unidentified
const REFERRAL_SOURCE = 0n

// fee events use 18 decimals, USDC.e transfers 6
const WAD_TO_USDC = 10n ** 12n

// fee counter is readable, and 0, from this block
const COUNTER_START_BLOCK = 7345400
const COUNTER_ABI = "function getTotalFeesCollected(address protocol, address token) view returns (uint256)"

// RISE archival RPC silently caps getLogs at 1000 results, ranges stay under peak density
const EVENTS = {
  collected: { maxBlockRange: 50, eventAbi: "event CollectedFees(address indexed protocol, address indexed token, uint256 amount)" },
  // missing from the published ABI
  deducted: { maxBlockRange: 100, eventAbi: "event DeductedFees(address indexed protocol, address indexed token, uint256 amount)" },
  builder: { maxBlockRange: 200, eventAbi: "event CollectedBuilderFees(uint16 indexed builderId, address indexed token, uint256 amount)" },
  // missing from the published ABI
  liquidation: { maxBlockRange: 200, eventAbi: "event CollectedLiquidationFees(address indexed protocol, address indexed token, address indexed recipient, uint256 amount)" },
  withdraw: { maxBlockRange: 500, eventAbi: "event WithdrawTradingFees(address indexed protocol, address indexed sender, address indexed token, uint256 amount, address to)" },
  payout: { maxBlockRange: 500, eventAbi: "event PayoutCredited(bytes32 indexed payoutId, address indexed account, address indexed token, uint256 amount, uint8 source, bytes32 reference, bytes32 data, address operator)" },
}

type Destination = "protocol" | "xlp"
const LIQUIDATION_FEE_RECIPIENTS: Record<string, Destination> = {
  // XLP vault liquidation account, until 2026-10-29
  "0xa51c3d367e895988232750d297d8904cd712ab91": "xlp",
  // RISEx Safe with the treasury's owners, from 2026-10-29
  "0x695d0af9b7cc595037ff89ed4d510d0624fbcfa1": "protocol",
  // 2026-04-12 only, credited to no account
  "0x0000000000000000000000000000000000000000": "protocol",
}

const LABELS = {
  TRADING_FEES: METRIC.TRADING_FEES,
  BUILDER_FEES: "Builder Code Fees",
  LIQUIDATION_FEES: METRIC.LIQUIDATION_FEES,
  BUILDER_FEES_TO_BUILDERS: "Builder Code Fees To Builders",
  LIQUIDATION_FEES_TO_XLP: "Liquidation Fees To XLP Vault",
  TRADING_FEES_TO_REFERRERS: "Trading Fees To Referrers",
  TRADING_FEES_TO_PROTOCOL: "Trading Fees To Protocol",
  LIQUIDATION_FEES_TO_PROTOCOL: "Liquidation Fees To Protocol",
}

const isPerpsUsdc = (log: any) => {
  if (log.token.toLowerCase() !== USDC) throw new Error(`RISEx fee in unexpected token ${log.token}`)
  return log.protocol.toLowerCase() === PERPS_MANAGER
}

const sumPerps = (logs: any[]) => logs.reduce((sum: bigint, log: any) => isPerpsUsdc(log) ? sum + BigInt(log.amount) : sum, 0n)

const sumBuilder = (logs: any[]) => logs.reduce((sum: bigint, log: any) => {
  if (log.token.toLowerCase() !== USDC) throw new Error(`RISEx builder fee in unexpected token ${log.token}`)
  return sum + BigInt(log.amount)
}, 0n)

const sumLiquidation = (logs: any[]) => {
  const sums: Record<Destination, bigint> = { protocol: 0n, xlp: 0n }
  for (const log of logs) {
    if (!isPerpsUsdc(log)) throw new Error(`RISEx liquidation fee from unexpected protocol ${log.protocol}`)
    const destination = LIQUIDATION_FEE_RECIPIENTS[log.recipient.toLowerCase()]
    if (!destination) throw new Error(`RISEx liquidation fee to unknown recipient ${log.recipient}`)
    sums[destination] += BigInt(log.amount)
  }
  return sums
}

const sumReferrals = (logs: any[]) => logs.reduce((sum: bigint, log: any) => {
  if (log.token.toLowerCase() !== USDC) throw new Error(`RISEx payout in unexpected token ${log.token}`)
  return BigInt(log.source) === REFERRAL_SOURCE ? sum + BigInt(log.amount) * WAD_TO_USDC : sum
}, 0n)

const readCounter = async (api: any, block: number): Promise<bigint> => {
  if (block < COUNTER_START_BLOCK) return 0n
  return BigInt(await api.call({ target: FEE_MANAGER, abi: COUNTER_ABI, params: [PERPS_MANAGER, USDC] }))
}

const fetch = async (options: FetchOptions) => {
  const fromBlock = await options.getFromBlock()
  const toBlock = await options.getToBlock()
  if (!(fromBlock <= toBlock)) throw new Error(`RISEx bad window ${fromBlock}-${toBlock}`)

  const getLogs = ({ eventAbi, maxBlockRange }: { eventAbi: string, maxBlockRange: number }, target = FEE_MANAGER) =>
    options.getLogs({ target, eventAbi, maxBlockRange, fromBlock, toBlock })
  const [collectedLogs, deductedLogs, builderLogs, liquidationLogs, withdrawLogs, payoutLogs, counterBefore, counterAfter] = await Promise.all([
    getLogs(EVENTS.collected),
    getLogs(EVENTS.deducted),
    getLogs(EVENTS.builder),
    getLogs(EVENTS.liquidation),
    getLogs(EVENTS.withdraw),
    getLogs(EVENTS.payout, PAYOUTS),
    readCounter(options.fromApi, fromBlock - 1),
    readCounter(options.toApi, toBlock),
  ])

  const collected = sumPerps(collectedLogs)
  // rebates go to RISEx's own Safe, so they stay in revenue
  const rebates = sumPerps(deductedLogs)
  const withdrawn = sumPerps(withdrawLogs) * WAD_TO_USDC
  // a counter mismatch means truncated logs
  if (counterAfter - counterBefore !== collected - rebates - withdrawn)
    throw new Error(`RISEx fee logs incomplete in blocks ${fromBlock}-${toBlock}: counter moved ${counterAfter - counterBefore}, logs give ${collected - rebates - withdrawn}`)

  const builderFees = sumBuilder(builderLogs)
  const liquidation = sumLiquidation(liquidationLogs)
  const referrals = sumReferrals(payoutLogs)

  const dailyFees = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()
  const dailyRevenue = options.createBalances()
  const add = (balances: any, wad: bigint, label: string) => {
    if (wad < 0n && label !== LABELS.TRADING_FEES_TO_PROTOCOL) throw new Error(`RISEx negative ${label} ${wad} in blocks ${fromBlock}-${toBlock}`)
    if (wad !== 0n) balances.add(USDC, wad / WAD_TO_USDC, label)
  }

  add(dailyFees, collected, LABELS.TRADING_FEES)
  add(dailyFees, builderFees, LABELS.BUILDER_FEES)
  add(dailyFees, liquidation.protocol + liquidation.xlp, LABELS.LIQUIDATION_FEES)

  add(dailySupplySideRevenue, builderFees, LABELS.BUILDER_FEES_TO_BUILDERS)
  add(dailySupplySideRevenue, liquidation.xlp, LABELS.LIQUIDATION_FEES_TO_XLP)
  add(dailySupplySideRevenue, referrals, LABELS.TRADING_FEES_TO_REFERRERS)

  add(dailyRevenue, collected - referrals, LABELS.TRADING_FEES_TO_PROTOCOL)
  add(dailyRevenue, liquidation.protocol, LABELS.LIQUIDATION_FEES_TO_PROTOCOL)

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue }
}

const methodology = {
  Fees: "Trading fees paid by takers and makers on RISEx perpetuals, builder code fees that front-ends charge on top, and liquidation fees, read from the RISEx FeeManager contract on RISE.",
  Revenue: "Trading fees collected by RISEx minus referral and affiliate commissions paid, plus liquidation fees sent to the RISEx multisig since 29 Oct 2026. Maker rebates are not deducted because they are paid to RISEx's own market-making Safe.",
  ProtocolRevenue: "Trading fees collected by RISEx minus referral and affiliate commissions paid, plus liquidation fees sent to the RISEx multisig since 29 Oct 2026. Maker rebates are not deducted because they are paid to RISEx's own market-making Safe.",
  SupplySideRevenue: "Builder code fees paid to the front-ends that routed the orders, liquidation fees paid to the XLP vault's liquidation account until 29 Oct 2026, and referral and affiliate commissions credited by RISEx's payout contract since 30 Sep 2026.",
}

const breakdownMethodology = {
  Fees: {
    [LABELS.TRADING_FEES]: "Taker and maker fees collected by RISEx on perpetual fills, excluding builder code fees. Until 10 Apr 2026 liquidation fees were collected here too.",
    [LABELS.BUILDER_FEES]: "Fees charged on top of RISEx fees by the front-end (builder code) that routed the order.",
    [LABELS.LIQUIDATION_FEES]: "1% fee on positions closed by partial liquidation.",
  },
  SupplySideRevenue: {
    [LABELS.BUILDER_FEES_TO_BUILDERS]: "Builder code fees credited to each builder's fee recipient.",
    [LABELS.LIQUIDATION_FEES_TO_XLP]: "Liquidation fees credited to the RLP account of the XLP vault's liquidation strategy, until 29 Oct 2026.",
    [LABELS.TRADING_FEES_TO_REFERRERS]: "Referral and affiliate commissions credited to referrers' RISEx balances by the treasury-funded payout contract, counted when paid (claims are weekly).",
  },
  Revenue: {
    [LABELS.TRADING_FEES_TO_PROTOCOL]: "Trading fees accrued to the RISEx protocol fee vault, net of referral and affiliate commissions paid that period. Maker rebates paid from it since 15 Sep 2026 go to RISEx's own market-making Safe, so they stay in revenue.",
    [LABELS.LIQUIDATION_FEES_TO_PROTOCOL]: "Liquidation fees credited to the RISEx multisig, since 29 Oct 2026.",
  },
  ProtocolRevenue: {
    [LABELS.TRADING_FEES_TO_PROTOCOL]: "Trading fees accrued to the RISEx protocol fee vault, net of referral and affiliate commissions paid that period. Maker rebates paid from it since 15 Sep 2026 go to RISEx's own market-making Safe, so they stay in revenue.",
    [LABELS.LIQUIDATION_FEES_TO_PROTOCOL]: "Liquidation fees credited to the RISEx multisig, since 29 Oct 2026.",
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
