import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Balances } from '@defillama/sdk'
import type { FetchOptions } from '../adapters/types'

// Run: node --test -r ts-node/register/transpile-only cli/ramses-accounting.test.ts
// Mock the source boundary; exercise the exported adapters and real USD balances.
const graph = require('graphql-request')
const originalRequest = graph.default
const start = Date.parse('2026-08-15T12:00:00Z') / 1000
const day = Math.floor(start / 86400) * 86400
let recordedVoterFees: string | null | undefined = '20'
let dlmmVoterFees: unknown = '2'
let dayFees: string | null | undefined = '100'
let financialOverrides: Record<string, unknown> = {}
let bribeTimes: number[] = []
const inWindow = (timestamp: number, variables: any) => timestamp >= Number(variables.from) && timestamp < Number(variables.to)
graph.default = async (_endpoint: string, query: string, variables: any = {}) => {
  if (query.includes('poolHourStats')) return { items: [{
    pool: 'pool', volumeUSD: '1000', feesUSD: '100', treasuryFeesUSD: '10',
    voterFeesUSD: recordedVoterFees, ...financialOverrides,
  }] }
  if (query.includes('getProtocolDayData')) {
    const row = { startOfDay: day, volumeUsd: '1000', feesUsd: dayFees, voterFeesUsd: '20', treasuryFeesUsd: '10', ...financialOverrides }
    return { ClProtocolDayData: [row], LegacyProtocolDayData: [row] }
  }
  if (query.includes('query bribes')) return { voteBribes: bribeTimes.filter(time => inWindow(time, variables)).map(() => ({
    token: { id: 'token' }, amount: '5', clPool: { id: 'pool' }, legacyPool: { id: 'pool' }, dlmmPool: { id: 'pool' },
  })) }
  if (query.includes('tokenDayDatas')) return { tokenDayDatas: [{ token: { id: 'token' }, priceUSD: '2' }] }
  if (query.includes('sarcophagusFunding')) return { SarcophagusFunding: [{ amountUSD: '3' }] }
  if (query.includes('dlmmHourStats')) return { DLMMPoolHourData: [start - 3600, start, start + 3600]
    .filter(time => inWindow(time, variables)).map(() => ({ volumeUSD: '100', feesUSD: '20', voterFeesUSD: dlmmVoterFees, treasuryFeesUSD: '6', ...financialOverrides })) }
  if (query.includes('getDLMMProtocolDayData')) return { DLMMProtocolDayData: [{ volumeUSD: '1000', feesUSD: dayFees, voterFeesUSD: '20', treasuryFeesUSD: '10', ...financialOverrides }] }
  throw new Error(`Unexpected source query: ${query}`)
}
const { fetchStats, createFetchHandler } = require('../dexs/ramses-cl-v2')
const dlmm = require('../dexs/ramses-dlmm').default
const options = (from = start, to = start + 3600): FetchOptions => ({
  chain: 'robinhood', startTimestamp: from - 1, endTimestamp: to, startOfDay: day,
  createBalances: () => new Balances({ chain: 'robinhood' }),
} as FetchOptions)
const usd = (balance: Balances) => balance.getUSDValue()

test('Ramses accounting', async t => {
  try {
    await t.test('hourly CL and legacy splits use recorded fees without current metadata', async () => {
      try {
        for (const recorded of ['20', '0']) {
          recordedVoterFees = recorded
          const result = await fetchStats(options())
          assert.equal(result.clUserFeesRevenueUSD, Number(recorded))
          assert.equal(result.legacyUserFeesRevenueUSD, Number(recorded))
          assert.equal(result.clProtocolRevenueUSD, 10)
          assert.equal(result.legacyProtocolRevenueUSD, 10)
          assert.equal(result.clVolumeUSD, 1000)
        }
      } finally { recordedVoterFees = '20' }
    })
    await t.test('missing required recorded fee split throws', async () => {
      try {
        for (const invalid of [undefined, null, '', 'NaN', 'Infinity']) {
          recordedVoterFees = invalid
          await assert.rejects(fetchStats(options()), /Invalid.*voterFeesUSD/)
        }
      } finally { recordedVoterFees = '20' }
    })
    await t.test('unaligned hourly windows throw instead of counting whole buckets', async () => {
      await assert.rejects(fetchStats(options(start + 1800, start + 5400)), /hour-aligned/)
      await assert.rejects(fetchStats(options(start, start + 3599)), /hour-aligned/)
    })
    await t.test('aligned historical full days retain recorded totals', async () => {
      const result = await fetchStats(options(day, day + 86400))
      assert.equal(result.clFeesUSD, 100)
      assert.equal(result.legacyFeesUSD, 100)
      assert.equal(result.clUserFeesRevenueUSD, 20)
    })
    await t.test('CL and legacy bribes exclude both outside boundary seconds and user fees', async () => {
      bribeTimes = [start - 1, start, start + 3599, start + 3600]
      for (const pool of ['cl', 'legacy']) {
        const result = await createFetchHandler(pool)(options())
        assert.equal(await usd(result.dailyUserFees), 100)
        assert.equal(await usd(result.dailyFees), 120)
        assert.equal(await usd(result.dailyRevenue), 50)
        assert.equal(await usd(result.dailySupplySideRevenue), 70)
        assert.equal(await usd(result.dailyHoldersRevenue), 43)
        assert.equal(await usd(result.dailyProtocolRevenue), 7)
        assert.notEqual(result.dailyFees, result.dailyUserFees)
      }
    })
    await t.test('DLMM recorded buckets and bribes use the intended half-open hour', async () => {
      const result = await dlmm.fetch(options())
      assert.equal(result.dailyVolume, 100)
      assert.equal(await usd(result.dailyUserFees), 20)
      assert.equal(await usd(result.dailyFees), 40)
      assert.equal(await usd(result.dailyRevenue), 28)
      assert.equal(await usd(result.dailySupplySideRevenue), 12)
      assert.equal(await usd(result.dailyHoldersRevenue), 25)
      assert.equal(await usd(result.dailyProtocolRevenue), 3)
    })
    await t.test('DLMM recorded zero voter fees survive without current metadata', async () => {
      try {
        dlmmVoterFees = '0'
        const result = await dlmm.fetch(options())
        assert.equal(await usd(result.dailyHoldersRevenue), 23)
        assert.equal(await usd(result.dailyProtocolRevenue), 3)
        assert.equal(await usd(result.dailyFees), await usd(result.dailyRevenue) + await usd(result.dailySupplySideRevenue))
      } finally { dlmmVoterFees = '2' }
    })
    await t.test('DLMM missing or invalid recorded splits throw', async () => {
      try {
        for (const invalid of [undefined, null, '', ' ', 'NaN', 'Infinity', '-1', -1, NaN, Infinity, true, {}, []]) {
          dlmmVoterFees = invalid
          await assert.rejects(dlmm.fetch(options()), /Invalid recorded DLMM voterFeesUSD/)
        }
      } finally { dlmmVoterFees = '2' }
    })
    await t.test('DLMM partial-hour windows throw', async () => {
      await assert.rejects(dlmm.fetch(options(start + 1800, start + 5400)), /hour-aligned/)
      await assert.rejects(dlmm.fetch(options(start, start + 3599)), /hour-aligned/)
    })
    await t.test('DLMM enables aligned hourly pulls for the default runner', () => {
      assert.equal(dlmm.pullHourly, true)
      assert.equal(dlmm.start, '2026-07-22')
    })
    await t.test('DLMM accepts numeric and numeric-string financial fields in hours and days', async () => {
      try {
        for (const asNumber of [false, true]) {
          financialOverrides = Object.fromEntries(Object.entries({ volumeUSD: 100, feesUSD: 20, voterFeesUSD: 2, treasuryFeesUSD: 6 })
            .map(([field, value]) => [field, asNumber ? value : String(value)]))
          for (const input of [options(), options(day, day + 86400)]) {
            const result = await dlmm.fetch(input)
            assert.equal(result.dailyVolume, 100)
            assert.equal(await usd(result.dailyUserFees), 20)
            assert.equal(await usd(result.dailySupplySideRevenue), 12)
            assert.equal(await usd(result.dailyFees), await usd(result.dailyRevenue) + await usd(result.dailySupplySideRevenue))
          }
        }
      } finally { financialOverrides = {} }
    })
    await t.test('DLMM overallocated recorded splits throw in hours and days', async () => {
      try {
        financialOverrides = { feesUSD: '20', voterFeesUSD: '15', treasuryFeesUSD: '10' }
        for (const input of [options(), options(day, day + 86400)]) {
          await assert.rejects(dlmm.fetch(input), /Recorded DLMM fee splits exceed feesUSD: 20 < 15 \+ 10/)
        }
      } finally { financialOverrides = {} }
    })
    await t.test('DLMM tolerates only machine-scale subtraction roundoff', async () => {
      const previousBribeTimes = bribeTimes
      try {
        bribeTimes = []
        financialOverrides = { feesUSD: '0.3', voterFeesUSD: '0.1', treasuryFeesUSD: '0.2' }
        for (const input of [options(), options(day, day + 86400)]) {
          const result = await dlmm.fetch(input)
          assert.equal(await usd(result.dailySupplySideRevenue), 0)
          assert.ok(Math.abs(await usd(result.dailyFees) - await usd(result.dailyRevenue)) <= 4 * Number.EPSILON * 0.3)
        }
        financialOverrides = { feesUSD: '0.3', voterFeesUSD: '0.1', treasuryFeesUSD: '0.200000001' }
        await assert.rejects(dlmm.fetch(options()), /fee splits exceed/)
      } finally { financialOverrides = {}; bribeTimes = previousBribeTimes }
    })
    await t.test('CL and legacy reject every negative hourly and daily financial field', async () => {
      try {
        for (const [input, fields] of [
          [options(), ['volumeUSD', 'feesUSD', 'voterFeesUSD', 'treasuryFeesUSD']],
          [options(day, day + 86400), ['volumeUsd', 'feesUsd', 'voterFeesUsd', 'treasuryFeesUsd']],
        ] as const) {
          for (const field of fields) {
            financialOverrides = { [field]: '-1' }
            await assert.rejects(fetchStats(input), new RegExp(`Invalid .*${field}`))
          }
        }
      } finally { financialOverrides = {} }
    })
    await t.test('present protocol day rows require valid financial fields', async () => {
      try {
        for (const invalid of [undefined, null, '', 'NaN', 'Infinity', '-1']) {
          dayFees = invalid
          await assert.rejects(dlmm.fetch(options(day, day + 86400)), /Invalid recorded DLMM feesUSD/)
          await assert.rejects(fetchStats(options(day, day + 86400)), /Invalid Ramses protocol day feesUsd/)
        }
      } finally { dayFees = '100' }
    })
    await t.test('bribes at the preceding date boundary are excluded from full days', async () => {
      bribeTimes = [day - 1, day, day + 86399, day + 86400]
      for (const fetch of [createFetchHandler('cl'), createFetchHandler('legacy'), dlmm.fetch]) {
        const result = await fetch(options(day, day + 86400))
        assert.equal(await usd(result.dailyFees), 120)
        assert.equal(await usd(result.dailyUserFees), 100)
      }
    })
  } finally { graph.default = originalRequest }
})
