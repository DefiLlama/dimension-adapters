import assert from 'node:assert/strict'
import { afterEach, test } from 'node:test'
import type { FetchOptions } from '../adapters/types'
import { blockscoutFeeAdapter2 } from './blockscoutFees'

const fetchURL = require('../utils/fetchURL')
const originalHttpGet = fetchURL.httpGet
const startOfDay = Date.parse('2026-10-31T00:00:00Z') / 1000

afterEach(() => {
  fetchURL.httpGet = originalHttpGet
})

function fixture(chain = 'omax') {
  const responses: Record<string, any> = {
    totalfees: { status: '1', message: 'OK', result: null },
    'indexing-status': { finished_indexing: true, finished_indexing_blocks: true },
    blocks: { items: [{ timestamp: '2026-11-01T00:00:00Z' }] },
    transactions: { items: [{ timestamp: '2026-10-28T01:57:39Z' }] },
  }
  const requests: string[] = []
  const balances: Record<string, number> = {}
  fetchURL.httpGet = async (url: string) => {
    requests.push(url)
    const key = Object.keys(responses).find(candidate => url.includes(candidate))
    assert.ok(key, `Unexpected request: ${url}`)
    if (responses[key] instanceof Error) throw responses[key]
    return responses[key]
  }
  const options = {
    chain,
    startOfDay,
    createBalances: () => ({ addCGToken: (token: string, amount: number) => { balances[token] = amount } }),
  } as unknown as FetchOptions
  const fetch = blockscoutFeeAdapter2(chain).adapter![chain].fetch!
  return { responses, requests, balances, run: () => fetch(options) }
}

test('accepts null fees only for a fully indexed Omax day after its latest transaction', async () => {
  const { run, balances, requests } = fixture()
  await run()
  assert.equal(balances['omax-token'], 0)
  assert.equal(requests.length, 4)
})

test('preserves nonzero Omax fees without checking empty-day coverage', async () => {
  const { run, responses, balances, requests } = fixture()
  responses.totalfees.result = '21000000'
  await run()
  assert.equal(balances['omax-token'], 21000000 / 1e18)
  assert.equal(requests.length, 1)
})

for (const [name, key, response] of [
  ['unfinished indexing', 'indexing-status', { finished_indexing: false, finished_indexing_blocks: true }],
  ['unfinished block indexing', 'indexing-status', { finished_indexing: true, finished_indexing_blocks: false }],
  ['incomplete daily block coverage', 'blocks', { items: [{ timestamp: '2026-10-31T23:59:59Z' }] }],
  ['missing blocks', 'blocks', { items: [] }],
  ['invalid block timestamp', 'blocks', { items: [{ timestamp: 'invalid' }] }],
  ['transaction on the requested day', 'transactions', { items: [{ timestamp: '2026-10-31T00:00:00Z' }] }],
  ['newer transaction', 'transactions', { items: [{ timestamp: '2026-11-01T00:00:00Z' }] }],
  ['missing transactions', 'transactions', { items: [] }],
  ['invalid transaction timestamp', 'transactions', { items: [{ timestamp: 'invalid' }] }],
] as const) {
  test(`rejects null Omax fees with ${name}`, async () => {
    const { run, responses } = fixture()
    responses[key] = response
    await assert.rejects(run, /Error fetching fees/)
  })
}

test('propagates source failures instead of assuming an empty day', async () => {
  const { run, responses } = fixture()
  responses.transactions = new Error('source unavailable')
  await assert.rejects(run, /source unavailable/)
})

test('does not convert malformed legacy responses to zero', async () => {
  const { run, responses, requests } = fixture()
  responses.totalfees = { status: '0', result: null }
  await assert.rejects(run, /Error fetching fees/)
  assert.equal(requests.length, 1)
})

test('does not change null handling for other Blockscout chains', async () => {
  const { run, requests } = fixture('swan')
  await assert.rejects(run, /Error fetching fees/)
  assert.equal(requests.length, 1)
})
