// GMX v2 daily active users, transactions and gas, decoded from the EventEmitter contract.
//
// Active users follow the "Users" count on GMX's own stats page (app.gmx.io), which counts a wallet
// that trades or provides liquidity:
//   - trades: one of its orders is executed (OrderExecuted): market, limit, take-profit and
//     stop-loss orders, swaps, and liquidations or auto-deleveraging of its positions
//   - provides liquidity: it requests a GM deposit, withdrawal or shift
//     (DepositCreated, WithdrawalCreated, ShiftCreated)
// All four are EventLog2 events with the account in topic2. Until October 2023 some liquidity requests
// were still emitted as EventLog1, which carries the account only in the event data, so those are read
// too. The stats page reads the receiver of a swap, which for some swaps is a market or vault contract;
// the account on the executed order is the wallet that placed it, or the contract that placed it on a
// user's behalf. Liquidity requests without an execution fee
// are skipped: GLV vaults create them when moving their own liquidity, and executing a shift creates a
// withdrawal and a deposit for the account that already paid for the shift.
//
// Transactions: the transactions the events above were emitted in.
//
// Gas: network fees users paid, after refunds, in the chain's native token. That is the execution
// fee each keeper keeps for executing a request (KeeperExecutionFee) plus the relay fee of gasless
// (Express) actions, which GMX's relay routers pay in the wrapped native token to the relay fee
// address set in the DataStore (RELAY_FEE_ADDRESS; e.g. Arbitrum tx
// 0x08ea4242aec49fff02efdf73f26ef44e2476a9b0bbfb9b64967fb6958d94c191). Gas of transactions users send
// themselves is not included: most GMX actions are executed by keepers or relayers, so the execution
// and relay fees are what users pay.
//
// Version 1: unique users per day cannot be added up from hourly counts.

import { ethers } from "ethers";
import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// OrderExecuted moved from EventLog1 (no account) to EventLog2 between 2023-09-25 and 2023-09-27, so
// counting starts on 2023-09-28, the first day every executed order carries the account.
// MegaETH: contracts deployed 2026-01-15, first user activity 2026-01-27.
// Botanix is left out, as in fees/gmx-v2: GMX sunset it on 2026-08-01 and the chain itself shut down.
const config: Record<string, { eventEmitter: string; dataStore: string; start: string }> = {
  [CHAIN.ARBITRUM]: {
    eventEmitter: '0xC8ee91A54287DB53897056e12D9819156D3822Fb',
    dataStore: '0xFD70de6b91282D8017aA4E741e9Ae325CAb992d8',
    start: '2023-09-28',
  },
  [CHAIN.AVAX]: {
    eventEmitter: '0xDb17B211c34240B014ab6d61d4A31FA0C0e20c26',
    dataStore: '0x2F0b22339414ADeD7D5F06f9D604c7fF5b2fe3f6',
    start: '2023-09-28',
  },
  [CHAIN.MEGAETH]: {
    eventEmitter: '0xAf2E131d483cedE068e21a9228aD91E623a989C2',
    dataStore: '0xE43C7B694f6b652a9F4A0f275C008d18758Dce35',
    start: '2026-01-27',
  },
}

const EVENT_DATA = 'tuple(tuple(tuple(string key, address value)[] items, tuple(string key, address[] value)[] arrayItems) addressItems, tuple(tuple(string key, uint256 value)[] items, tuple(string key, uint256[] value)[] arrayItems) uintItems, tuple(tuple(string key, int256 value)[] items, tuple(string key, int256[] value)[] arrayItems) intItems, tuple(tuple(string key, bool value)[] items, tuple(string key, bool[] value)[] arrayItems) boolItems, tuple(tuple(string key, bytes32 value)[] items, tuple(string key, bytes32[] value)[] arrayItems) bytes32Items, tuple(tuple(string key, bytes value)[] items, tuple(string key, bytes[] value)[] arrayItems) bytesItems, tuple(tuple(string key, string value)[] items, tuple(string key, string[] value)[] arrayItems) stringItems) eventData'
const EVENT_LOG_1_TOPIC = '0x137a44067c8961cd7e1d876f4754a5a3a75989b4552f1843fc69c3b372def160'
const EVENT_LOG_2_TOPIC = '0x468a25a7ba624ceea6e540ad6f49171b52495b648417ae91bca21676d8a24dc5'
const EVENT_LOG_1_ABI = `event EventLog1(address msgSender, string eventName, string indexed eventNameHash, bytes32 indexed topic1, ${EVENT_DATA})`
const EVENT_LOG_2_ABI = `event EventLog2(address msgSender, string eventName, string indexed eventNameHash, bytes32 indexed topic1, bytes32 indexed topic2, ${EVENT_DATA})`
const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const TRANSFER_ABI = 'event Transfer(address indexed from, address indexed to, uint256 value)'

const eventNameTopic = (name: string) => ethers.keccak256(ethers.toUtf8Bytes(name))
const dataStoreKey = (name: string) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['string'], [name]))
const padAddress = (address: string) => '0x' + address.slice(2).toLowerCase().padStart(64, '0')
const topicToAddress = (topic: string) => '0x' + topic.slice(26).toLowerCase()

const TRADE_EVENTS = ['OrderExecuted']
const LIQUIDITY_EVENTS = ['DepositCreated', 'WithdrawalCreated', 'ShiftCreated']

type KeyValue = { key?: string; value?: any; 0?: string; 1?: any }
const eventDataItems = (log: any, type: 'addressItems' | 'uintItems'): KeyValue[] =>
  (log.args.eventData ?? log.args[5] ?? log.args[4])[type].items
const uintItem = (log: any, key: string): bigint => {
  const item = eventDataItems(log, 'uintItems').find((i) => (i.key ?? i[0]) === key)
  return item == null ? 0n : BigInt((item.value ?? item[1]).toString())
}
const addressItem = (log: any, key: string): string | undefined => {
  const item = eventDataItems(log, 'addressItems').find((i) => (i.key ?? i[0]) === key)
  return item == null ? undefined : String(item.value ?? item[1]).toLowerCase()
}

const fetch = async (options: FetchOptions) => {
  const { eventEmitter, dataStore } = config[options.chain]
  const getEventLog = (topic: string, eventAbi: string) => (name: string) => options.getLogs({
    targets: [eventEmitter],
    topics: [topic, eventNameTopic(name)],
    eventAbi,
    onlyArgs: false,
  })
  const getEventLog1 = getEventLog(EVENT_LOG_1_TOPIC, EVENT_LOG_1_ABI)
  const getEventLog2 = getEventLog(EVENT_LOG_2_TOPIC, EVENT_LOG_2_ABI)

  const [tradeLogs, liquidityLogs, legacyLiquidityLogs, keeperFeeLogs, [wnt, relayFeeAddress]] = await Promise.all([
    Promise.all(TRADE_EVENTS.map(getEventLog2)),
    Promise.all(LIQUIDITY_EVENTS.map(getEventLog2)),
    Promise.all(LIQUIDITY_EVENTS.map(getEventLog1)),
    getEventLog1('KeeperExecutionFee'),
    options.api.multiCall({
      target: dataStore,
      abi: 'function getAddress(bytes32 key) view returns (address)',
      calls: [dataStoreKey('WNT'), dataStoreKey('RELAY_FEE_ADDRESS')],
    }),
  ])

  const users = new Set<string>()
  const transactions = new Set<string>()
  const count = (account: string, log: any) => {
    users.add(account)
    transactions.add(log.transactionHash.toLowerCase())
  }
  const paidExecutionFee = (log: any) => uintItem(log, 'executionFee') > 0n
  tradeLogs.flat().forEach((log: any) => count(topicToAddress(log.topics[3]), log))
  liquidityLogs.flat().filter(paidExecutionFee).forEach((log: any) => count(topicToAddress(log.topics[3]), log))
  legacyLiquidityLogs.flat().filter(paidExecutionFee).forEach((log: any) => {
    const account = addressItem(log, 'account')
    if (!account) throw new Error(`gmx-v2: liquidity request without an account in ${log.transactionHash}`)
    count(account, log)
  })

  let gasPaid = keeperFeeLogs.reduce((sum: bigint, log: any) => sum + uintItem(log, 'executionFeeAmount'), 0n)
  if (relayFeeAddress && relayFeeAddress !== ethers.ZeroAddress) {
    const relayFeeLogs = await options.getLogs({
      target: wnt,
      eventAbi: TRANSFER_ABI,
      topics: [TRANSFER_TOPIC, null as any, padAddress(relayFeeAddress)],
    })
    gasPaid += relayFeeLogs.reduce((sum: bigint, log: any) => sum + BigInt(log.value.toString()), 0n)
  }

  return {
    dailyActiveUsers: users.size,
    dailyTransactionsCount: transactions.size,
    dailyGasUsed: Number(gasPaid) / 1e18,
  }
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  adapter: Object.fromEntries(Object.entries(config).map(([chain, { start }]) => [chain, { start }])),
  methodology: {
    ActiveUsers: "Unique wallets per day that traded (an order of theirs was executed: market, limit, take-profit, stop-loss, swap, or a liquidation or auto-deleveraging of their position) or requested a GM liquidity deposit, withdrawal or shift, the same activity GMX counts as a user on its stats page. Read from the account on EventLog2 OrderExecuted, DepositCreated, WithdrawalCreated and ShiftCreated, and from the event data of liquidity requests still emitted as EventLog1 until October 2023; liquidity requests without an execution fee are GLV vaults moving their own liquidity or the internal steps of an executed shift, and are left out.",
    Transactions: "Transactions in which those orders were executed or those liquidity requests were made.",
    GasUsed: "Network fees users paid after refunds, in the chain's native token: execution fees kept by keepers (KeeperExecutionFee) plus relay fees for gasless Express actions (wrapped native token sent to the relay fee address). Gas of transactions users send themselves is not included.",
  },
}

export default adapter
