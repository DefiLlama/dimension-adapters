import { PromisePool } from '@supercharge/promise-pool'
import { Interface } from 'ethers'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'
import { httpGet } from '../utils/fetchURL'

const FACTORY = '0x279dc5E05d43644C6cd2F2813F306a320e785cdD'

const BUY = 'event Buy(address indexed token, address indexed buyer, uint256 tiaIn, uint256 fee, uint256 tokensOut, uint256 newVirtualTiaReserve, uint256 newVirtualTokenReserve, string message)'
const SELL = 'event Sell(address indexed token, address indexed seller, uint256 tokensIn, uint256 fee, uint256 tiaOut, uint256 newVirtualTiaReserve, uint256 newVirtualTokenReserve, string message)'
const CREATOR_FEE_ACCRUED = 'event CreatorFeeAccrued(address indexed token, address indexed creator, address indexed trader, uint256 amount)'
const REFERRAL_ACCRUED = 'event ReferralAccrued(address indexed token, address indexed referrer, address indexed trader, uint256 amount)'

const BURNED_PROTOCOL_FEES = 'Burned Protocol Fees'
const REFERRAL_FEES = 'Referral Fees'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'
const LOG_BLOCK_RANGE = 100_000
const BLOCKSCOUT_LOG_LIMIT = 1_000
const BLOCKSCOUT_API = 'https://eden.blockscout.com/api'
const factoryInterface = new Interface([BUY, SELL, CREATOR_FEE_ACCRUED, REFERRAL_ACCRUED])

async function getLogsForRange(eventName: string, topic: string, fromBlock: number, toBlock: number): Promise<any[]> {
  const response = await httpGet(`${BLOCKSCOUT_API}?module=logs&action=getLogs&fromBlock=${fromBlock}&toBlock=${toBlock}&address=${FACTORY}&topic0=${topic}`)
  if (response.status === '0' && response.message === 'No logs found') return []
  if (response.status !== '1' || !Array.isArray(response.result)) {
    throw new Error(`Blockscout log query failed: ${response.message ?? 'unknown error'}`)
  }

  if (response.result.length < BLOCKSCOUT_LOG_LIMIT) {
    return response.result.map((log: any) => {
      const parsed = factoryInterface.parseLog({ data: log.data, topics: log.topics.filter(Boolean) })
      if (!parsed) throw new Error(`Unable to decode ${eventName} log`)
      return parsed.args
    })
  }

  if (fromBlock === toBlock) throw new Error(`Blockscout returned ${BLOCKSCOUT_LOG_LIMIT} ${eventName} logs for one block`)
  const midpoint = Math.floor((fromBlock + toBlock) / 2)
  return [
    ...await getLogsForRange(eventName, topic, fromBlock, midpoint),
    ...await getLogsForRange(eventName, topic, midpoint + 1, toBlock),
  ]
}

async function getLogs(eventName: string, fromBlock: number, toBlock: number) {
  const event = factoryInterface.getEvent(eventName)
  if (!event) throw new Error(`Missing ${eventName} event ABI`)
  const ranges = []
  for (let start = fromBlock; start <= toBlock; start += LOG_BLOCK_RANGE) {
    ranges.push([start, Math.min(start + LOG_BLOCK_RANGE - 1, toBlock)])
  }

  const { results, errors } = await PromisePool
    .for(ranges)
    .withConcurrency(4)
    .process(([start, end]) => getLogsForRange(eventName, event.topicHash, start, end))

  if (errors.length) throw errors[0]
  return results.flat()
}

const fetch = async (options: FetchOptions) => {
  const [fromBlock, toBlock, treasury] = await Promise.all([
    options.getStartBlock(),
    options.getEndBlock(),
    options.toApi.call({ target: FACTORY, abi: 'address:treasury' }),
  ])
  if (treasury.toLowerCase() !== ZERO_ADDRESS) {
    throw new Error(`bot.fun treasury is no longer the zero address: ${treasury}`)
  }
  const buys = await getLogs('Buy', fromBlock, toBlock)
  const sells = await getLogs('Sell', fromBlock, toBlock)
  const creatorFees = await getLogs('CreatorFeeAccrued', fromBlock, toBlock)
  const referralFees = await getLogs('ReferralAccrued', fromBlock, toBlock)

  const totalFees = [...buys, ...sells].reduce<bigint>((sum, log) => sum + BigInt(log.fee), 0n)
  const totalCreatorFees = creatorFees.reduce<bigint>((sum, log) => sum + BigInt(log.amount), 0n)
  const totalReferralFees = referralFees.reduce<bigint>((sum, log) => sum + BigInt(log.amount), 0n)
  const totalSupplySideRevenue = totalCreatorFees + totalReferralFees
  const totalBurnedRevenue = totalFees - totalSupplySideRevenue

  if (totalBurnedRevenue < 0n) throw new Error('Supply-side revenue exceeds bot.fun trading fees')

  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  addTia(dailyFees, totalFees, METRIC.TRADING_FEES)
  addTia(dailyUserFees, totalFees, METRIC.TRADING_FEES)
  addTia(dailyRevenue, totalBurnedRevenue, BURNED_PROTOCOL_FEES)
  addTia(dailyHoldersRevenue, totalBurnedRevenue, BURNED_PROTOCOL_FEES)
  addTia(dailySupplySideRevenue, totalCreatorFees, METRIC.CREATOR_FEES)
  addTia(dailySupplySideRevenue, totalReferralFees, REFERRAL_FEES)

  return {
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
  }

  function addTia(balances: ReturnType<FetchOptions['createBalances']>, amount: bigint, label: string) {
    balances.addCGToken('celestia', Number(amount) / 1e18, label)
  }
}

const breakdownMethodology = {
  Fees: {
    [METRIC.TRADING_FEES]: 'Fees paid by users when buying or selling coins on bot.fun bonding curves.',
  },
  UserFees: {
    [METRIC.TRADING_FEES]: 'Fees paid directly by bot.fun traders.',
  },
  Revenue: {
    [BURNED_PROTOCOL_FEES]: 'The protocol share of trading fees, transferred to the zero address and permanently burned.',
  },
  HoldersRevenue: {
    [BURNED_PROTOCOL_FEES]: 'The protocol share of trading fees burned as native TIA.',
  },
  SupplySideRevenue: {
    [METRIC.CREATOR_FEES]: 'Trading fees accrued to coin creators.',
    [REFERRAL_FEES]: 'Trading fees accrued to referrers.',
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.EDEN],
  start: '2026-05-01',
  breakdownMethodology,
  methodology: {
    Fees: 'Trading fees paid by users on bot.fun bonding-curve buys and sells.',
    UserFees: 'Trading fees paid directly by bot.fun traders.',
    Revenue: 'Trading fees remaining after creator and referral allocations. The protocol currently sends this share to the zero address.',
    ProtocolRevenue: 'Zero while the bot.fun treasury is configured as the zero address.',
    HoldersRevenue: 'The protocol share of trading fees burned as native TIA.',
    SupplySideRevenue: 'Trading fees accrued to coin creators and referrers.',
  },
}

export default adapter
