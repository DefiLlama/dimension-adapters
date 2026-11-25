import ADDRESSES from '../helpers/coreAssets.json'
import { FetchOptions, SimpleAdapter } from '../adapters/types'
import { CHAIN } from '../helpers/chains'
import { METRIC } from '../helpers/metrics'
import { fetchURLAutoHandleRateLimit } from '../utils/fetchURL'

// Staked TRX proxy, verified implementation https://tronscan.org/#/contract/TUAV6ZSCXtF8KVvDKSeVmAbJEovTBf4HtG/code
const STRX = 'TU3kjFuhtEo42tsCBtfYUAZxoqQ4yuSLQ5'
// JustLend DAO Energy Rental market, rents out sTRX energy and pays the rent to sTRX
// https://tronscan.org/#/contract/TNoHbPuBQrVanVf9qxUsSvHdB2eDkeDAKD/code
const ENERGY_RENTAL_MARKET = 'TU2MJ5Veik1LRAgjeSzEdvmDYx7mefJZvd'

// sTRX reserveFactor() = (rentFactor, rewardFactor), unchanged since launch, checked against ReservesAdded each run
const SCALE = 10n ** 18n
const RENT_RESERVE_FACTOR = 2n * 10n ** 17n
const VOTE_RESERVE_FACTOR = 2n * 10n ** 17n
if (RENT_RESERVE_FACTOR > SCALE || VOTE_RESERVE_FACTOR > SCALE) throw new Error('justlend-strx: reserve factor above SCALE')

const TRONGRID_PAGE_SIZE = 200
const TRONGRID_PAGES_MAX = 200
const TRONGRID_DELAY_MS = 2500
// public TronGrid 429s for longer than the default 3 tries, 5 s apart
const TRONGRID_TRIES = 12

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// TronGrid caps a page at 200 events, page with the fingerprint cursor
const getEvents = async (contract: string, eventName: string, fromTimestamp: number, toTimestamp: number) => {
  const events: any[] = []
  let fingerprint: string | undefined
  let pages = 0
  while (pages < TRONGRID_PAGES_MAX) {
    pages += 1
    const params = [
      `event_name=${eventName}`,
      `min_block_timestamp=${fromTimestamp * 1000}`,
      // max_block_timestamp is inclusive, stop 1 ms early so a block on the boundary lands in one window only
      `max_block_timestamp=${toTimestamp * 1000 - 1}`,
      'order_by=block_timestamp,asc',
      `limit=${TRONGRID_PAGE_SIZE}`,
    ]
    if (fingerprint) params.push(`fingerprint=${fingerprint}`)
    const res = await fetchURLAutoHandleRateLimit(`https://api.trongrid.io/v1/contracts/${contract}/events?${params.join('&')}`, TRONGRID_TRIES)
    if (res?.success !== true || !Array.isArray(res.data)) throw new Error(`justlend-strx: TronGrid ${eventName} request failed on ${contract}`)
    events.push(...res.data)
    fingerprint = res.meta?.fingerprint
    if (!fingerprint || res.data.length === 0) return events
    await delay(TRONGRID_DELAY_MS)
  }
  throw new Error(`justlend-strx: more than ${TRONGRID_PAGES_MAX} pages of ${eventName} on ${contract}`)
}

const getAmount = (event: any, field: string): bigint => {
  const value = event.result?.[field]
  if (typeof value !== 'string' || !/^\d+$/.test(value)) throw new Error(`justlend-strx: ${event.event_name} ${event.transaction_id} has no ${field}`)
  return BigInt(value)
}

const fetch = async ({ createBalances, fromTimestamp, toTimestamp }: FetchOptions) => {
  const trx = ADDRESSES.tron.WTRX
  const dailyFees = createBalances()
  const dailyRevenue = createBalances()
  const dailySupplySideRevenue = createBalances()
  const addIncome = (sun: bigint, reserveFactor: bigint, labels: [string, string, string]) => {
    const reserve = sun * reserveFactor / SCALE
    dailyFees.add(trx, sun, labels[0])
    dailyRevenue.add(trx, reserve, labels[1])
    dailySupplySideRevenue.add(trx, sun - reserve, labels[2])
  }
  const rentLabels = (feeLabel: string): [string, string, string] => [feeLabel, 'Energy Rental Reserve Share', 'Energy Rental To sTRX Holders']

  // rent as the market accrues it, the market pays it to sTRX on the next sTRX index update
  // OrderIndex.rental repeats RentIndex income per order and liquidateFee goes to the liquidator, neither is counted
  for (const event of await getEvents(ENERGY_RENTAL_MARKET, 'RentIndex', fromTimestamp, toTimestamp))
    addIncome(getAmount(event, 'income'), RENT_RESERVE_FACTOR, rentLabels('Energy Rental Duration Fee'))
  await delay(TRONGRID_DELAY_MS)
  for (const eventName of ['ReturnResource', 'Liquidate']) {
    for (const event of await getEvents(ENERGY_RENTAL_MARKET, eventName, fromTimestamp, toTimestamp))
      addIncome(getAmount(event, 'usageRental'), RENT_RESERVE_FACTOR, rentLabels('Energy Rental Fee'))
    await delay(TRONGRID_DELAY_MS)
  }

  // voting rewards sTRX withdraws for the TRX it votes with
  const incomeEvents = await getEvents(STRX, 'Income', fromTimestamp, toTimestamp)
  await delay(TRONGRID_DELAY_MS)
  const reserveEvents = await getEvents(STRX, 'ReservesAdded', fromTimestamp, toTimestamp)
  for (const event of incomeEvents)
    addIncome(getAmount(event, 'fromVote'), VOTE_RESERVE_FACTOR, [METRIC.STAKING_REWARDS, 'Staking Rewards Reserve Share', 'Staking Rewards To sTRX Holders'])

  // sTRX books reserves in the same tx as Income, a mismatch means reserveFactor changed
  const incomeTxs = new Set(incomeEvents.map((event) => event.transaction_id))
  if (!reserveEvents.every((event) => incomeTxs.has(event.transaction_id))) throw new Error('justlend-strx: ReservesAdded without Income in the same tx')
  const expectedReserves = incomeEvents.reduce((sum, event) => sum + (getAmount(event, 'fromRent') * RENT_RESERVE_FACTOR + getAmount(event, 'fromVote') * VOTE_RESERVE_FACTOR) / SCALE, 0n)
  const bookedReserves = reserveEvents.reduce((sum, event) => sum + getAmount(event, 'add'), 0n)
  if (expectedReserves !== bookedReserves) throw new Error(`justlend-strx: reserves ${bookedReserves} != ${expectedReserves} from reserveFactor, update the factors`)

  return {
    dailyFees,
    dailyRevenue,
    dailyProtocolRevenue: dailyRevenue,
    dailySupplySideRevenue,
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.TRON],
  // first Income and RentIndex events
  start: '2023-04-15',
  methodology: {
    Fees: 'TRON voting rewards earned by the TRX staked through sTRX, plus the rent and usage charges paid by renters on the JustLend Energy Rental market, which rents out sTRX energy and pays its income to sTRX.',
    Revenue: 'The 20% of energy rental and the 20% of voting rewards that the sTRX contract keeps as reserves.',
    ProtocolRevenue: 'The 20% of energy rental and the 20% of voting rewards that the sTRX contract keeps as reserves, claimable only by the JustLend DAO reserve admin.',
    SupplySideRevenue: 'The other 80% of energy rental and voting rewards, added to the TRX backing sTRX and so to the sTRX exchange rate.',
  },
  breakdownMethodology: {
    Fees: {
      'Energy Rental Duration Fee': 'Rent paid for the time energy is held, as accrued by the Energy Rental market, from the income field of RentIndex events.',
      'Energy Rental Fee': 'Usage charge paid by renters when rented energy comes back used, from the usageRental field of ReturnResource and Liquidate events.',
      [METRIC.STAKING_REWARDS]: 'TRON voting rewards that sTRX withdraws for the TRX it votes with, from the fromVote field of sTRX Income events.',
    },
    Revenue: {
      'Energy Rental Reserve Share': '20% of energy rental kept by sTRX as reserves (rentFactor).',
      'Staking Rewards Reserve Share': '20% of voting rewards kept by sTRX as reserves (rewardFactor).',
    },
    ProtocolRevenue: {
      'Energy Rental Reserve Share': '20% of energy rental kept by sTRX as reserves (rentFactor).',
      'Staking Rewards Reserve Share': '20% of voting rewards kept by sTRX as reserves (rewardFactor).',
    },
    SupplySideRevenue: {
      'Energy Rental To sTRX Holders': '80% of energy rental, added to the TRX backing sTRX.',
      'Staking Rewards To sTRX Holders': '80% of voting rewards, added to the TRX backing sTRX.',
    },
  },
}

export default adapter
