import assert from 'node:assert/strict'
import { test, mock } from 'node:test'
import * as graphqlRequest from 'graphql-request'
import { CHAIN } from '../../helpers/chains'

// Regression test for a silent-zero bug: a subgraph failure (network error,
// malformed response) must propagate to the caller, not be swallowed into a
// fake successful zero-volume/zero-fee day. This exact anti-pattern was
// removed once from the sibling on-chain adapter (ce9d11b8c "remove try
// catch") and reintroduced here during the subgraph migration (#2877).
test('a subgraph query failure propagates instead of returning a fake zero day', async () => {
  const requestMock = mock.method(graphqlRequest, 'request', async () => {
    throw new Error('subgraph unreachable')
  })

  try {
    delete require.cache[require.resolve('./index')]
    const { default: adapter } = require('./index')

    const createBalances = () => ({ add: () => {} })

    await assert.rejects(
      () =>
        adapter.fetch({
          createBalances,
          fromTimestamp: 0,
          toTimestamp: 1,
          chain: CHAIN.ETHEREUM,
        } as any),
      /subgraph unreachable/,
    )
  } finally {
    requestMock.mock.restore()
  }
})

// A malformed response (missing/null poolDayStats, e.g. a partial gateway
// error that still returns HTTP 200) must also propagate, not be treated
// as a legitimate empty day.
test('a malformed subgraph response (missing poolDayStats) propagates instead of returning a fake zero day', async () => {
  const requestMock = mock.method(graphqlRequest, 'request', async () => ({}))

  try {
    delete require.cache[require.resolve('./index')]
    const { default: adapter } = require('./index')

    const createBalances = () => ({ add: () => {} })

    await assert.rejects(
      () =>
        adapter.fetch({
          createBalances,
          fromTimestamp: 0,
          toTimestamp: 1,
          chain: CHAIN.ETHEREUM,
        } as any),
      /Malformed subgraph response/,
    )
  } finally {
    requestMock.mock.restore()
  }
})

// A genuinely empty result set (no swaps in the window) is a legitimate
// zero day and must NOT throw.
test('an empty poolDayStats array resolves with zero balances, not an error', async () => {
  const requestMock = mock.method(graphqlRequest, 'request', async () => ({
    poolDayStats: [],
  }))

  try {
    delete require.cache[require.resolve('./index')]
    const { default: adapter } = require('./index')

    const adds: unknown[] = []
    const createBalances = () => ({ add: (...args: unknown[]) => adds.push(args) })

    const result = await adapter.fetch({
      createBalances,
      fromTimestamp: 0,
      toTimestamp: 1,
      chain: CHAIN.ETHEREUM,
    } as any)

    assert.ok(result.dailyVolume)
    assert.ok(result.dailyFees)
    assert.equal(adds.length, 0)
  } finally {
    requestMock.mock.restore()
  }
})
