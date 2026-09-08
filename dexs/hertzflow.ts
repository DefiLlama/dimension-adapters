import { FetchOptions, FetchResultV2, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'

// BSC mainnet EventEmitter: https://bscscan.com/address/0xf6030850365F79E7a8CAB31850A063199fd0CC10
const EVENT_EMITTER = '0xf6030850365F79E7a8CAB31850A063199fd0CC10'
// EventLog1 topic0 and indexed keccak256("PositionFeesCollected") event-name topic.
const EVENT_LOG_1_TOPIC = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160'
const POSITION_FEES_COLLECTED_TOPIC = '0xe096982abd597114bdaa4a60612f87fabfcc7206aa12d61c50e7ba1e6c291100'

// GMX v2-compatible USD values use 30-decimal fixed-point precision:
// https://github.com/gmx-io/gmx-synthetics/blob/main/contracts/utils/Precision.sol#L23
const USD_DECIMALS = 30
const USD_PRECISION = 10n ** BigInt(USD_DECIMALS)

// BSC mainnet token contracts:
// HFUSD: https://bscscan.com/address/0x7F7AD43d1Baa6BeA7f53F72D97D90b4FC0f662DF
// HFUSD1: https://bscscan.com/address/0x026C39Ab4B07f4C8C62b5824F0F9D7BE5087405a
// U: https://bscscan.com/address/0xcE24439F2D9C6a2289F741120FE202248B666666
// USD1: https://bscscan.com/address/0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d
const HFUSD = '0x7F7AD43d1Baa6BeA7f53F72D97D90b4FC0f662DF'
const HFUSD1 = '0x026C39Ab4B07f4C8C62b5824F0F9D7BE5087405a'
const U = '0xcE24439F2D9C6a2289F741120FE202248B666666'
const USD1 = '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d'

const WRAPPER_TO_UNDERLYING: Record<string, string> = {
  [HFUSD.toLowerCase()]: U,
  [HFUSD1.toLowerCase()]: USD1,
}

const EVENT_LOG_1_ABI = 'event EventLog1(address msgSender, string eventName, string indexed eventNameHash, bytes32 indexed topic1, tuple(tuple(tuple(string key, address value)[] items, tuple(string key, address[] value)[] arrayItems) addressItems, tuple(tuple(string key, uint256 value)[] items, tuple(string key, uint256[] value)[] arrayItems) uintItems, tuple(tuple(string key, int256 value)[] items, tuple(string key, int256[] value)[] arrayItems) intItems, tuple(tuple(string key, bool value)[] items, tuple(string key, bool[] value)[] arrayItems) boolItems, tuple(tuple(string key, bytes32 value)[] items, tuple(string key, bytes32[] value)[] arrayItems) bytes32Items, tuple(tuple(string key, bytes value)[] items, tuple(string key, bytes[] value)[] arrayItems) bytesItems, tuple(tuple(string key, string value)[] items, tuple(string key, string[] value)[] arrayItems) stringItems) eventData)'

type KeyValue = { key?: string; value?: any; 0?: string; 1?: any }

function toRecord(items: KeyValue[]): Record<string, any> {
  return Object.fromEntries(items.map((item) => [item.key ?? item[0], item.value ?? item[1]]))
}

function value(record: Record<string, any>, key: string): bigint {
  const item = record[key]
  return item == null ? 0n : BigInt(item.toString())
}

function add(balance: any, token: string, amount: bigint, label: string) {
  if (amount > 0n) balance.add(token, amount.toString(), label)
}

function assertSubtract(minuend: bigint, subtrahend: bigint, context: string): bigint {
  if (subtrahend > minuend) {
    throw new Error(`HertzFlow ${context} breakdown exceeds its gross amount`)
  }
  return minuend - subtrahend
}

function usd30(amount: bigint): string {
  const fraction = (amount % USD_PRECISION).toString().padStart(USD_DECIMALS, '0').replace(/0+$/, '')
  return `${amount / USD_PRECISION}${fraction ? `.${fraction}` : ''}`
}

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  // HertzFlow emits all protocol events through one universal contract. The
  // event-name topic is therefore required to isolate PositionFeesCollected.
  const logs = await options.getLogs({
    targets: [EVENT_EMITTER],
    topics: [EVENT_LOG_1_TOPIC, POSITION_FEES_COLLECTED_TOPIC],
    eventAbi: EVENT_LOG_1_ABI,
  })

  for (const log of logs) {
    const eventData = log.eventData ?? log[4]
    const addresses = toRecord(eventData.addressItems.items)
    const uints = toRecord(eventData.uintItems.items)
    const collateralToken = addresses.collateralToken
    const feeToken = WRAPPER_TO_UNDERLYING[collateralToken.toLowerCase()] ?? collateralToken

    const tradeSizeUsd = value(uints, 'tradeSizeUsd')
    const positionFee = value(uints, 'positionFeeAmount')
    const traderDiscount = value(uints, 'referral.traderDiscountAmount')
    const l1Reward = value(uints, 'referral.l1RewardAmount')
    const l2Reward = value(uints, 'referral.l2RewardAmount')
    const borrowingFee = value(uints, 'borrowingFeeAmount')
    const borrowingToProtocol = value(uints, 'borrowingFeeAmountForFeeReceiver')
    const liquidationFee = value(uints, 'liquidationFeeAmount')
    const liquidationToProtocol = value(uints, 'liquidationFeeAmountForFeeReceiver')
    const totalToProtocol = value(uints, 'feeReceiverAmount')
    const positionToPool = value(uints, 'positionFeeAmountForPool')
    const uiFee = value(uints, 'uiFeeAmount')

    const positionUserFees = assertSubtract(positionFee, traderDiscount, 'trader discount')
    const positionToProtocol = assertSubtract(
      totalToProtocol,
      borrowingToProtocol + liquidationToProtocol,
      'protocol fee receiver',
    )
    const borrowingToPool = assertSubtract(borrowingFee, borrowingToProtocol, 'borrowing fee')
    const liquidationToPool = assertSubtract(liquidationFee, liquidationToProtocol, 'liquidation fee')
    const referralRewards = l1Reward + l2Reward
    const positionCreditOffset = assertSubtract(
      assertSubtract(positionUserFees, positionToProtocol, 'position fee protocol share'),
      positionToPool + referralRewards,
      'position fee supply-side share',
    )

    dailyVolume.addUSDValue(Number(usd30(tradeSizeUsd)), 'Perpetual Trading Volume')

    add(dailyFees, feeToken, positionUserFees, 'Position Fees')
    add(dailyFees, feeToken, borrowingFee, 'Borrowing Fees')
    add(dailyFees, feeToken, liquidationFee, 'Liquidation Fees')
    add(dailyFees, feeToken, uiFee, 'UI Fees')

    add(dailyUserFees, feeToken, positionUserFees, 'Position Fees')
    add(dailyUserFees, feeToken, borrowingFee, 'Borrowing Fees')
    add(dailyUserFees, feeToken, liquidationFee, 'Liquidation Fees')
    add(dailyUserFees, feeToken, uiFee, 'UI Fees')

    add(dailyRevenue, feeToken, positionToProtocol, 'Position Fees To Protocol')
    add(dailyRevenue, feeToken, borrowingToProtocol, 'Borrowing Fees To Protocol')
    add(dailyRevenue, feeToken, liquidationToProtocol, 'Liquidation Fees To Protocol')

    add(dailyProtocolRevenue, feeToken, positionToProtocol, 'Position Fees To Protocol')
    add(dailyProtocolRevenue, feeToken, borrowingToProtocol, 'Borrowing Fees To Protocol')
    add(dailyProtocolRevenue, feeToken, liquidationToProtocol, 'Liquidation Fees To Protocol')

    add(dailySupplySideRevenue, feeToken, positionToPool, 'Position Fees To LPs')
    add(dailySupplySideRevenue, feeToken, borrowingToPool, 'Borrowing Fees To LPs')
    add(dailySupplySideRevenue, feeToken, liquidationToPool, 'Liquidation Fees To LPs')
    add(dailySupplySideRevenue, feeToken, referralRewards, 'Referral Rewards')
    add(dailySupplySideRevenue, feeToken, uiFee, 'UI Fees To Integrators')
    add(dailySupplySideRevenue, feeToken, positionCreditOffset, 'Position Fees To Credit Claim Vault')
  }

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Volume: 'Notional size of each executed position increase or decrease, including liquidation closes. Each PositionFeesCollected event represents one trader action, so no maker-side volume is added.',
  Fees: 'Position fees paid after trading discounts, plus borrowing, liquidation, and UI fees. Funding transfers between traders are excluded.',
  UserFees: 'All position, borrowing, liquidation, and UI fees actually paid by traders after referral discounts.',
  Revenue: 'The position, borrowing, and liquidation fee amounts accrued as claimable protocol fees and withdrawable through FeeHandler.',
  ProtocolRevenue: 'The protocol fee share of position, borrowing, and liquidation fees held through FeeHandler.',
  SupplySideRevenue: 'Fees allocated to LPs, affiliates, UI integrators, and the credit fee claim vault.',
}

const breakdownMethodology = {
  Volume: {
    'Perpetual Trading Volume': 'Notional USD size executed against HertzFlow market liquidity.',
  },
  Fees: {
    'Position Fees': 'Open and close fees paid by traders after trading discounts.',
    'Borrowing Fees': 'Accrued borrowing fees paid when a position is updated or closed.',
    'Liquidation Fees': 'Additional fee charged when a position is liquidated.',
    'UI Fees': 'Optional fee charged by the interface selected by the trader.',
  },
  UserFees: {
    'Position Fees': 'Open and close fees paid by traders after referral discounts.',
    'Borrowing Fees': 'Accrued borrowing fees paid by traders.',
    'Liquidation Fees': 'Liquidation fees paid by traders.',
    'UI Fees': 'Optional interface fees paid by traders.',
  },
  Revenue: {
    'Position Fees To Protocol': 'Protocol fee receiver share of position fees after rebates.',
    'Borrowing Fees To Protocol': 'Protocol fee receiver share of borrowing fees.',
    'Liquidation Fees To Protocol': 'Protocol fee receiver share of liquidation fees.',
  },
  ProtocolRevenue: {
    'Position Fees To Protocol': 'Protocol fee receiver share of position fees after rebates.',
    'Borrowing Fees To Protocol': 'Protocol fee receiver share of borrowing fees.',
    'Liquidation Fees To Protocol': 'Protocol fee receiver share of liquidation fees.',
  },
  SupplySideRevenue: {
    'Position Fees To LPs': 'Position fee share retained by market liquidity providers.',
    'Borrowing Fees To LPs': 'Borrowing fee share retained by market liquidity providers.',
    'Liquidation Fees To LPs': 'Liquidation fee share retained by market liquidity providers.',
    'Referral Rewards': 'Position fee rebates paid to first- and second-level affiliates.',
    'UI Fees To Integrators': 'UI fees paid to external interface operators.',
    'Position Fees To Credit Claim Vault': 'LP-bound position fees transferred to the credit claim vault when a trader applies a credit fee offset.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  chains: [CHAIN.BSC],
  start: '2026-08-14',
  fetch,
  methodology,
  breakdownMethodology,
}

export default adapter
