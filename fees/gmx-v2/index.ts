// GMX v2 fees decoded from the EventEmitter contract (EventLog1 events).
// Mirrors the logic of the previous Dune query https://dune.com/queries/4959575/9826428:
//   margin fees      = positionFeeAmount * collateralTokenPrice + borrowingFeeUsd   (PositionFeesCollected)
//   liquidation fees = liquidationFeeAmount * collateralTokenPrice                  (PositionFeesCollected)
//   swap fees        = tokenPrice * (feeReceiverAmount + feeAmountForPool)          (SwapFeesCollected)
//   price impact     = distributionAmount of the index token                        (PositionImpactPoolDistributed)
// GMX prices are 30 - tokenDecimals precision, so amount * price is always a 30-decimal USD value.

import { ethers } from "ethers";
import { FetchOptions, FetchResultV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { METRIC } from "../../helpers/metrics";

const config: Record<string, { eventEmitter: string; dataStore: string; start: string }> = {
  [CHAIN.ARBITRUM]: {
    eventEmitter: '0xC8ee91A54287DB53897056e12D9819156D3822Fb',
    dataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
    start: '2023-08-01',
  },
  [CHAIN.AVAX]: {
    eventEmitter: '0xDb17B211c34240B014ab6d61d4A31FA0C0e20c26',
    dataStore: '0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6',
    start: '2023-08-24',
  },
  [CHAIN.MEGAETH]: {
    eventEmitter: '0xAf2E131d483cedE068e21a9228aD91E623a989C2',
    dataStore: '0xE43C7B694f6b652a9F4A0f275C008d18758Dce35',
    start: '2026-04-08',
  },
}

const EVENT_LOG_1_TOPIC = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160'
const EVENT_LOG_1_ABI = 'event EventLog1(address msgSender, string eventName, string indexed eventNameHash, bytes32 indexed topic1, tuple(tuple(tuple(string key, address value)[] items, tuple(string key, address[] value)[] arrayItems) addressItems, tuple(tuple(string key, uint256 value)[] items, tuple(string key, uint256[] value)[] arrayItems) uintItems, tuple(tuple(string key, int256 value)[] items, tuple(string key, int256[] value)[] arrayItems) intItems, tuple(tuple(string key, bool value)[] items, tuple(string key, bool[] value)[] arrayItems) boolItems, tuple(tuple(string key, bytes32 value)[] items, tuple(string key, bytes32[] value)[] arrayItems) bytes32Items, tuple(tuple(string key, bytes value)[] items, tuple(string key, bytes[] value)[] arrayItems) bytesItems, tuple(tuple(string key, string value)[] items, tuple(string key, string[] value)[] arrayItems) stringItems) eventData)'

const eventNameTopic = (name: string) => ethers.keccak256(ethers.toUtf8Bytes(name))
const POSITION_FEES_COLLECTED = eventNameTopic('PositionFeesCollected')
const SWAP_FEES_COLLECTED = eventNameTopic('SwapFeesCollected')
const POSITION_IMPACT_POOL_DISTRIBUTED = eventNameTopic('PositionImpactPoolDistributed')

// DataStore key for a market's index token: keccak256(abi.encode(market, keccak256(abi.encode("INDEX_TOKEN"))))
const abi = ethers.AbiCoder.defaultAbiCoder()
const INDEX_TOKEN_KEY = ethers.keccak256(abi.encode(['string'], ['INDEX_TOKEN']))
const indexTokenKey = (market: string) => ethers.keccak256(abi.encode(['address', 'bytes32'], [market, INDEX_TOKEN_KEY]))

const PRICE_IMPACT = 'Price Impact'

// revenue split factors
const REVENUE = 0.37
const PROTOCOL = 0.1
const HOLDERS = 0.27
const SUPPLY_SIDE = 0.63

type KeyValue = { key?: string; value?: any; 0?: string; 1?: any }
const toRecord = (items: KeyValue[]): Record<string, any> =>
  Object.fromEntries(items.map((item) => [item.key ?? item[0], item.value ?? item[1]]))
const uint = (record: Record<string, any>, key: string): bigint => {
  const item = record[key]
  return item == null ? 0n : BigInt(item.toString())
}
const usd30ToNumber = (amount: bigint): number => Number(amount / 10n ** 12n) / 1e18

const fetch = async (options: FetchOptions): Promise<FetchResultV2> => {
  const { eventEmitter, dataStore } = config[options.chain]
  const getLogs = (nameTopic: string) => options.getLogs({
    targets: [eventEmitter],
    topics: [EVENT_LOG_1_TOPIC, nameTopic],
    eventAbi: EVENT_LOG_1_ABI,
  })

  const [positionLogs, swapLogs, impactLogs] = await Promise.all([
    getLogs(POSITION_FEES_COLLECTED),
    getLogs(SWAP_FEES_COLLECTED),
    getLogs(POSITION_IMPACT_POOL_DISTRIBUTED),
  ])

  let marginFees = 0n
  let liquidationFees = 0n
  let swapFees = 0n

  for (const log of positionLogs) {
    const uints = toRecord((log.eventData ?? log[4]).uintItems.items)
    const price = (uint(uints, 'collateralTokenPrice.min') + uint(uints, 'collateralTokenPrice.max')) / 2n
    marginFees += uint(uints, 'positionFeeAmount') * price + uint(uints, 'borrowingFeeUsd')
    liquidationFees += uint(uints, 'liquidationFeeAmount') * price
  }

  for (const log of swapLogs) {
    const uints = toRecord((log.eventData ?? log[4]).uintItems.items)
    swapFees += uint(uints, 'tokenPrice') * (uint(uints, 'feeReceiverAmount') + uint(uints, 'feeAmountForPool'))
  }

  // positive price impact distributed from the impact pool to LPs, denominated in the market's index token
  const impactByMarket: Record<string, bigint> = {}
  for (const log of impactLogs) {
    const eventData = log.eventData ?? log[4]
    const market = toRecord(eventData.addressItems.items).market
    const amount = uint(toRecord(eventData.uintItems.items), 'distributionAmount')
    if (amount > 0n) impactByMarket[market] = (impactByMarket[market] ?? 0n) + amount
  }
  const markets = Object.keys(impactByMarket)
  const indexTokens: string[] = markets.length ? await options.api.multiCall({
    target: dataStore,
    abi: 'function getAddress(bytes32 key) view returns (address)',
    calls: markets.map(indexTokenKey),
  }) : []

  const dailyFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyProtocolRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  const addUsd = (amount: number, metric: string) => {
    dailyFees.addUSDValue(amount, metric)
    dailyRevenue.addUSDValue(amount * REVENUE, metric)
    dailyProtocolRevenue.addUSDValue(amount * PROTOCOL, metric)
    dailyHoldersRevenue.addUSDValue(amount * HOLDERS, metric)
    dailySupplySideRevenue.addUSDValue(amount * SUPPLY_SIDE, metric)
  }
  addUsd(usd30ToNumber(marginFees), METRIC.MARGIN_FEES)
  addUsd(usd30ToNumber(liquidationFees), METRIC.LIQUIDATION_FEES)
  addUsd(usd30ToNumber(swapFees), METRIC.SWAP_FEES)

  markets.forEach((market, i) => {
    const token = indexTokens[i]
    const amount = impactByMarket[market]
    dailyFees.add(token, amount, PRICE_IMPACT)
    dailyRevenue.add(token, amount * 37n / 100n, PRICE_IMPACT)
    dailyProtocolRevenue.add(token, amount * 10n / 100n, PRICE_IMPACT)
    dailyHoldersRevenue.add(token, amount * 27n / 100n, PRICE_IMPACT)
    dailySupplySideRevenue.add(token, amount * 63n / 100n, PRICE_IMPACT)
  })

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }
}

const methodology = {
  Fees: "Fees from opening/closing perpetual positions, borrowing fees, swap fees, liquidation fees, and positive price impact distributed from the impact pool, decoded from EventEmitter logs",
  UserFees: "Fees from opening/closing perpetual positions, swap fees, and liquidation fees paid by traders",
  Revenue: "37% of all collected fees - split between protocol treasury (10%) and GMX token holders (27%)",
  ProtocolRevenue: "10% of all fees goes to the protocol treasury",
  HoldersRevenue: "27% of all fees goes to GMX token stakers",
  SupplySideRevenue: "63% of all fees goes to GM token liquidity providers",
}

const breakdownMethodology = {
  Fees: {
    [METRIC.MARGIN_FEES]: "Fees from opening/closing perpetual positions and borrowing fees charged to maintain leveraged positions",
    [METRIC.SWAP_FEES]: "Fees charged when swapping tokens through GMX v2 markets",
    [METRIC.LIQUIDATION_FEES]: "Fees collected when positions are liquidated due to insufficient collateral",
    [PRICE_IMPACT]: "Positive price impact distributed from the position impact pool to the market pool, in index token",
  },
  Revenue: {
    [METRIC.MARGIN_FEES]: "37% of margin and borrowing fees retained by protocol",
    [METRIC.SWAP_FEES]: "37% of swap fees retained by protocol",
    [METRIC.LIQUIDATION_FEES]: "37% of liquidation fees retained by protocol",
    [PRICE_IMPACT]: "37% of distributed price impact retained by protocol",
  },
  ProtocolRevenue: {
    [METRIC.MARGIN_FEES]: "10% of margin and borrowing fees to protocol treasury",
    [METRIC.SWAP_FEES]: "10% of swap fees to protocol treasury",
    [METRIC.LIQUIDATION_FEES]: "10% of liquidation fees to protocol treasury",
    [PRICE_IMPACT]: "10% of distributed price impact to protocol treasury",
  },
  HoldersRevenue: {
    [METRIC.MARGIN_FEES]: "27% of margin and borrowing fees distributed to GMX token stakers",
    [METRIC.SWAP_FEES]: "27% of swap fees distributed to GMX token stakers",
    [METRIC.LIQUIDATION_FEES]: "27% of liquidation fees distributed to GMX token stakers",
    [PRICE_IMPACT]: "27% of distributed price impact to GMX token stakers",
  },
  SupplySideRevenue: {
    [METRIC.MARGIN_FEES]: "63% of margin and borrowing fees distributed to GM token liquidity providers",
    [METRIC.SWAP_FEES]: "63% of swap fees distributed to GM token liquidity providers",
    [METRIC.LIQUIDATION_FEES]: "63% of liquidation fees distributed to GM token liquidity providers",
    [PRICE_IMPACT]: "63% of distributed price impact to GM token liquidity providers",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  adapter: Object.fromEntries(Object.entries(config).map(([chain, { start }]) => [chain, { start }])),
  methodology,
  breakdownMethodology,
}

export default adapter
