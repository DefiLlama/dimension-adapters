import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { Balances, cache, coins } from '@defillama/sdk'
import type { ChainApi } from '@defillama/sdk'
import type { FetchOptions } from '../adapters/types'
import { getAdapterFromHelpers } from '../factory/registry'
import { filterPools } from '../helpers/uniswap'

function fixture(context: TestContext, failures: number[]) {
  context.mock.method(coins, 'getPrices', async () => ({}))
  const pairs = Object.fromEntries(Array.from({ length: 10 }, (_, index) => [
    `0x${(index + 1).toString(16).padStart(40, '0')}`,
    ['0x1111111111111111111111111111111111111111', '0x2222222222222222222222222222222222222222'],
  ]))
  let attempts = 0
  const api = {
    chain: 'eni',
    log: () => {},
    multiCall: async ({ calls }: { calls: unknown[] }) => {
      const failed = failures[attempts++] ?? 0
      return calls.map((_, index) => index < failed ? null : '1000')
    },
  } as unknown as ChainApi
  const createBalances = () => ({ add: () => {}, getUSDValue: async () => 1000 })
  return { api, pairs, createBalances, attempts: () => attempts }
}

test('opted-in pool filtering rejects persistent partial failures without a successful retry', async context => {
  const options = fixture(context, [12, 12, 12])
  await assert.rejects(filterPools({ ...options, enforceBalanceFailureRatio: true }), /12\/20 pooled balance calls failed/)
  assert.equal(options.attempts(), 3)
})

test('default pool filtering preserves deterministic partial-failure handling', async context => {
  const options = fixture(context, [12, 12, 12])
  assert.ok(Object.keys(await filterPools(options)).length > 0)
})

test('opted-in filtering retains the existing ten-percent tolerance', async context => {
  const options = fixture(context, [2, 2, 2])
  assert.ok(Object.keys(await filterPools({ ...options, enforceBalanceFailureRatio: true })).length > 0)
})

test('opted-in filtering accepts balances recovered by retries', async context => {
  const options = fixture(context, [12, 0])
  assert.equal(Object.keys(await filterPools({ ...options, enforceBalanceFailureRatio: true })).length, 10)
  assert.equal(options.attempts(), 2)
})

test('default filtering still rejects a high residual failure ratio after retry repairs', async context => {
  const options = fixture(context, [12, 8, 8])
  await assert.rejects(filterPools(options), /8\/20 pooled balance calls failed/)
})

test('default filtering still rejects a completely failed balance batch', async context => {
  const options = fixture(context, [20, 20, 20])
  await assert.rejects(filterPools(options), /20\/20 pooled balance calls failed/)
})

for (const metric of ['fees', 'dexs']) {
  test(`Dswap ${metric} fails before scanning swaps when pool coverage remains incomplete`, async context => {
    const options = fixture(context, [12, 12, 12])
    const pairs = Object.keys(options.pairs)
    context.mock.method(cache, 'readCache', async () => ({
      pairs,
      token0s: pairs.map(pair => options.pairs[pair][0]),
      token1s: pairs.map(pair => options.pairs[pair][1]),
    }))
    const loaded = getAdapterFromHelpers(metric, 'daoaas-swap')
    assert.ok(loaded)
    const fetch = loaded.adapter.adapter!.eni.fetch!
    await assert.rejects(fetch({
      ...options,
      chain: 'eni',
      getLogs: async () => { throw new Error('Swap scan must not run with incomplete pool coverage') },
    } as unknown as FetchOptions), /12\/20 pooled balance calls failed/)
  })

  for (const hasSwaps of [true, false]) {
    test(`Dswap ${metric} preserves accounting with complete reads and ${hasSwaps ? 'swaps' : 'no swaps'}`, async context => {
      const options = fixture(context, [])
      const pairs = Object.keys(options.pairs)
      context.mock.method(cache, 'readCache', async () => ({
        pairs,
        token0s: pairs.map(pair => options.pairs[pair][0]),
        token1s: pairs.map(pair => options.pairs[pair][1]),
      }))
      context.mock.method(options.api, 'multiCall', async ({ abi, calls }: { abi: string, calls: unknown[] }) =>
        calls.map(() => abi === 'bool:stable' ? false : '1000'))
      const loaded = getAdapterFromHelpers(metric, 'daoaas-swap')
      assert.ok(loaded)
      const result = await loaded.adapter.adapter!.eni.fetch!({
        ...options,
        chain: 'eni',
        createBalances: () => {
          const balances = new Balances({ chain: 'eni' })
          balances.getUSDValue = async () => 1000
          return balances
        },
        getLogs: async () => pairs.map(() => hasSwaps ? [{ amount0In: 0, amount1In: 100000, amount0Out: 0, amount1Out: 0 }] : []),
      } as unknown as FetchOptions)
      const amount = (balances: any) => Object.values(balances.getBalances()).reduce((total: number, value) => total + Number(value), 0)
      assert.equal(amount(result.dailyVolume), hasSwaps ? 1000000 : 0)
      assert.equal(amount(result.dailyFees), hasSwaps ? 3000 : 0)
      assert.equal(amount(result.dailyUserFees), hasSwaps ? 3000 : 0)
      assert.equal(amount(result.dailyRevenue), hasSwaps ? 1500 : 0)
      assert.equal(amount(result.dailyProtocolRevenue), hasSwaps ? 1500 : 0)
      assert.equal(amount(result.dailySupplySideRevenue), hasSwaps ? 1500 : 0)
    })
  }
}
