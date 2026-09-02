import assert from 'node:assert/strict'
import { test } from 'node:test'
import { filterPools } from './uniswap'

// filterPools's RPC-failure guard used to be all-or-nothing: it only refused to
// report pools as empty when EVERY balanceOf call failed (res.every(bal => bal
// == null)). A single surviving call anywhere in a large batch disarmed the
// guard entirely, so a partial RPC outage (e.g. 998 of 1000 calls timing out)
// silently reported real pools as empty/zero instead of throwing.
//
// Run with: node --test -r ts-node/register/transpile-only helpers/uniswap.test.ts

function fakeApi(results: (string | null)[]) {
  return {
    chain: 'ethereum',
    multiCall: async () => results,
  } as any
}

// A minimal stand-in for @defillama/sdk's Balances: treats each added raw
// amount as a 1:1 USD value so the test stays deterministic with no real
// price lookups.
function fakeCreateBalances() {
  const entries: number[] = []
  return {
    add: (_target: string, amount: any) => {
      entries.push(Number(amount ?? 0))
    },
    getUSDValue: async () => entries.reduce((sum, n) => sum + n, 0),
  }
}

function pairsOf(n: number) {
  const pairs: Record<string, string[]> = {}
  for (let i = 0; i < n; i++) pairs[`pair-${i}`] = [`token-${i}`]
  return pairs
}

test('throws when nearly every balance call fails (998/1000 null)', async () => {
  const results = Array(1000).fill(null)
  results[0] = '500'
  results[1] = '500'
  await assert.rejects(
    () => filterPools({ api: fakeApi(results), pairs: pairsOf(1000), createBalances: fakeCreateBalances }),
    /filterPools: .*failed on ethereum/,
  )
})

test('throws when every balance call fails (1000/1000 null)', async () => {
  const results = Array(1000).fill(null)
  await assert.rejects(
    () => filterPools({ api: fakeApi(results), pairs: pairsOf(1000), createBalances: fakeCreateBalances }),
    /filterPools: .*failed on ethereum/,
  )
})

test('does not throw on a normal low failure rate (5/1000 null)', async () => {
  const results = Array(1000).fill('500')
  for (let i = 0; i < 5; i++) results[i] = null
  const out = await filterPools({ api: fakeApi(results), pairs: pairsOf(1000), createBalances: fakeCreateBalances })
  assert.ok(Object.keys(out).length > 0)
})

test('does not throw right at the 10% failure boundary (100/1000 null)', async () => {
  const results = Array(1000).fill('500')
  for (let i = 0; i < 100; i++) results[i] = null
  const out = await filterPools({ api: fakeApi(results), pairs: pairsOf(1000), createBalances: fakeCreateBalances })
  assert.ok(Object.keys(out).length > 0)
})

test('throws just past the 10% failure boundary (101/1000 null)', async () => {
  const results = Array(1000).fill('500')
  for (let i = 0; i < 101; i++) results[i] = null
  await assert.rejects(
    () => filterPools({ api: fakeApi(results), pairs: pairsOf(1000), createBalances: fakeCreateBalances }),
    /filterPools: .*failed on ethereum/,
  )
})

test('does not throw when every call succeeds', async () => {
  const results = Array(10).fill('500')
  const out = await filterPools({ api: fakeApi(results), pairs: pairsOf(10), createBalances: fakeCreateBalances })
  assert.equal(Object.keys(out).length, 10)
})
