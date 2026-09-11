import assert from 'node:assert/strict'
import { test, TestContext } from 'node:test'
import { cache, coins } from '@defillama/sdk'
import { getUniV2LogAdapter } from './uniswap'
import ADDRESSES from './coreAssets.json'

// Run: node -r ts-node/register/transpile-only helpers/uniswap.test.ts
const factory = '0x0000000000000000000000000000000000000001'
const pair = '0x0000000000000000000000000000000000000002'
const token0 = ADDRESSES.cronos.WCRO_1
const token1 = ADDRESSES.cronos.USDC

class TestBalances {
  value = 0
  add(_token: string, amount: unknown) { this.value += Number(amount ?? 0) }
  async getUSDValue() { return this.value }
  clone(ratio = 1) {
    const result = new TestBalances()
    result.value = this.value * ratio
    return result
  }
}

function fixture(t: TestContext, balance: string | null, logs: any[] = []) {
  t.mock.method(cache, 'readCache', async () => ({ pairs: [pair], token0s: [token0], token1s: [token1] }))
  t.mock.method(coins, 'getPrices', async () => ({ [`cronos:${token0.toLowerCase()}`]: { price: 1 } }))
  const getLogs = t.mock.fn(async () => [logs])
  const options = {
    chain: 'cronos',
    createBalances: () => new TestBalances(),
    getLogs,
    api: {
      chain: 'cronos',
      log: () => {},
      multiCall: async ({ abi, calls }: { abi: string, calls: unknown[] }) => calls.map(() => abi === 'erc20:balanceOf' ? balance : false),
    },
  }
  return { options, getLogs }
}

test('volume-only empty-pool window omits fees and never queries logs', async t => {
  const { options, getLogs } = fixture(t, '0')
  const result = await getUniV2LogAdapter({ factory, volumeOnly: true })(options)
  assert.deepEqual(Object.keys(result), ['dailyVolume'])
  assert.equal(result.dailyVolume.value, 0)
  assert.equal(getLogs.mock.callCount(), 0)
})

test('volume-only window with eligible pools and no swaps omits fees', async t => {
  const { options, getLogs } = fixture(t, '1000')
  const result = await getUniV2LogAdapter({ factory, volumeOnly: true })(options)
  assert.deepEqual(Object.keys(result), ['dailyVolume'])
  assert.equal(result.dailyVolume.value, 0)
  assert.equal(getLogs.mock.callCount(), 1)
})

test('volume-only swaps count one token side and omit fee dimensions', async t => {
  const { options } = fixture(t, '1000', [{ amount0In: '100', amount1In: '0', amount0Out: '0', amount1Out: '90' }])
  const result = await getUniV2LogAdapter({ factory, volumeOnly: true })(options)
  assert.deepEqual(Object.keys(result), ['dailyVolume'])
  assert.equal(result.dailyVolume.value, 100)
})

test('existing empty-pool fee outputs and custom callback behavior are preserved', async t => {
  const { options } = fixture(t, '0')
  const customLogic = t.mock.fn(() => { throw new Error('Existing empty path must not call custom logic') })
  const result = await getUniV2LogAdapter({ factory, customLogic, userFeesRatio: 1, revenueRatio: 0.5 })(options)
  assert.equal(result.dailyVolume.value, 0)
  assert.equal(result.dailyFees.value, 0)
  assert.equal(result.dailyUserFees, 0)
  assert.equal(result.dailyRevenue, 0)
  assert.equal(result.dailySupplySideRevenue, 0)
  assert.equal(customLogic.mock.callCount(), 0)
})

test('existing nonempty custom fee callbacks are preserved', async t => {
  const { options } = fixture(t, '1000', [{ amount0In: '100', amount1In: '0', amount0Out: '0', amount1Out: '90' }])
  const customLogic = t.mock.fn(({ dailyVolume, dailyFees }: { dailyVolume: TestBalances, dailyFees: TestBalances }) => ({ dailyVolume, dailyFees }))
  const result = await getUniV2LogAdapter({ factory, customLogic })(options)
  assert.equal(result.dailyVolume.value, 100)
  assert.equal(result.dailyFees.value, 0.3)
  assert.equal(customLogic.mock.callCount(), 1)
})

test('failed pool balance reads throw rather than returning zero volume', async t => {
  const { options, getLogs } = fixture(t, null)
  await assert.rejects(getUniV2LogAdapter({ factory, volumeOnly: true })(options), /pooled balance calls failed/)
  assert.equal(getLogs.mock.callCount(), 0)
})
