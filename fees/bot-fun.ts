import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'

const FACTORY = '0x279dc5E05d43644C6cd2F2813F306a320e785cdD'

const BUY = 'event Buy(address indexed token, address indexed buyer, uint256 tiaIn, uint256 fee, uint256 tokensOut, uint256 newVirtualTiaReserve, uint256 newVirtualTokenReserve, string message)'
const SELL = 'event Sell(address indexed token, address indexed seller, uint256 tokensIn, uint256 fee, uint256 tiaOut, uint256 newVirtualTiaReserve, uint256 newVirtualTokenReserve, string message)'
const CREATOR_FEE_ACCRUED = 'event CreatorFeeAccrued(address indexed token, address indexed creator, address indexed trader, uint256 amount)'
const REFERRAL_ACCRUED = 'event ReferralAccrued(address indexed token, address indexed referrer, address indexed trader, uint256 amount)'

const BURNED_PROTOCOL_FEES = 'Burned Protocol Fees'
const REFERRAL_FEES = 'Referral Fees'
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const fetch = async (options: FetchOptions) => {
  const treasury = await options.toApi.call({ target: FACTORY, abi: 'address:treasury' })

  const dailyVolume = options.createBalances()
  const dailyFees = options.createBalances()
  const dailyUserFees = options.createBalances()
  const dailyRevenue = options.createBalances()
  const dailyHoldersRevenue = options.createBalances()
  const dailySupplySideRevenue = options.createBalances()

  let revenue = 0n

  if (treasury.toLowerCase() !== ZERO_ADDRESS) {
    throw new Error(`bot.fun treasury is no longer the zero address: ${treasury}`)
  }

  const buyLogs = await options.getLogs({ eventAbi: BUY, target: FACTORY })
  const sellLogs = await options.getLogs({ eventAbi: SELL, target: FACTORY })
  const creatorFeesLogs = await options.getLogs({ eventAbi: CREATOR_FEE_ACCRUED, target: FACTORY })
  const referralFeesLogs = await options.getLogs({ eventAbi: REFERRAL_ACCRUED, target: FACTORY })

  for (const log of buyLogs) {
    revenue += BigInt(log.fee)
    dailyVolume.addCGToken('celestia', Number(log.tiaIn) / 1e18)
    dailyUserFees.addCGToken('celestia', Number(log.fee) / 1e18, METRIC.TRADING_FEES)
    dailyFees.addCGToken('celestia', Number(log.fee) / 1e18, METRIC.TRADING_FEES)
  }

  for (const log of sellLogs) {
    revenue += BigInt(log.fee)
    dailyVolume.addCGToken('celestia', Number(log.tiaOut) / 1e18)
    dailyUserFees.addCGToken('celestia', Number(log.fee) / 1e18, METRIC.TRADING_FEES)
    dailyFees.addCGToken('celestia', Number(log.fee) / 1e18, METRIC.TRADING_FEES)
  }

  for (const log of creatorFeesLogs) {
    revenue -= BigInt(log.amount)
    dailySupplySideRevenue.addCGToken('celestia', Number(log.amount) / 1e18, METRIC.CREATOR_FEES)
  }

  for (const log of referralFeesLogs) {
    revenue -= BigInt(log.amount)
    dailySupplySideRevenue.addCGToken('celestia', Number(log.amount) / 1e18, REFERRAL_FEES)
  }

  if (revenue < 0n) throw new Error('Supply-side revenue exceeds bot.fun trading fees')

  dailyRevenue.addCGToken('celestia', Number(revenue) / 1e18, BURNED_PROTOCOL_FEES)
  dailyHoldersRevenue.addCGToken('celestia', Number(revenue) / 1e18, BURNED_PROTOCOL_FEES)

  return {
    dailyVolume,
    dailyFees,
    dailyUserFees,
    dailyRevenue,
    dailyProtocolRevenue: 0,
    dailyHoldersRevenue,
    dailySupplySideRevenue,
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
  pullHourly: true,
  fetch,
  chains: [CHAIN.EDEN],
  start: '2026-05-01',
  breakdownMethodology,
  methodology: {
    Volume: 'Volume of TIA traded on bot.fun bonding curves.',
    Fees: 'Trading fees paid by users on bot.fun bonding-curve buys and sells.',
    UserFees: 'Trading fees paid directly by bot.fun traders.',
    Revenue: 'Trading fees remaining after creator and referral allocations. The protocol currently sends this share to the zero address.',
    ProtocolRevenue: 'Zero while the bot.fun treasury is configured as the zero address.',
    HoldersRevenue: 'The protocol share of trading fees burned as native TIA.',
    SupplySideRevenue: 'Trading fees accrued to coin creators and referrers.',
  },
}

export default adapter
