import assert from 'node:assert/strict'
import { test } from 'node:test'
import axios from 'axios'
import fetchURL from './fetchURL'

test('does not retry permanent HTTP failures', async (t) => {
  const get = t.mock.method(axios, 'get', async () => {
    const error = new Error('not found') as Error & { response?: { status: number } }
    error.response = { status: 404 }
    throw error
  })

  await assert.rejects(fetchURL('https://example.com/missing'))
  assert.equal(get.mock.calls.length, 1)
})

test('does not retry an invalid successful response', async (t) => {
  const get = t.mock.method(axios, 'get', async () => ({ status: 200, data: null }))

  await assert.rejects(fetchURL('https://example.com/empty-response'))
  assert.equal(get.mock.calls.length, 1)
})

test('waits before retrying a transient HTTP failure', async (t) => {
  const attempts: number[] = []
  t.mock.method(axios, 'get', async () => {
    attempts.push(Date.now())
    if (attempts.length === 1) {
      const error = new Error('server error') as Error & { response?: { status: number } }
      error.response = { status: 503 }
      throw error
    }
    return { status: 200, data: { ok: true } }
  })

  const result = await fetchURL('https://example.com/temporary-error', 1)

  assert.deepEqual(result, { ok: true })
  assert.equal(attempts.length, 2)
  assert.ok(attempts[1] - attempts[0] >= 400)
})

test('retries a network failure without an HTTP response', async (t) => {
  const attempts: number[] = []
  t.mock.method(axios, 'get', async () => {
    attempts.push(Date.now())
    if (attempts.length === 1) {
      const error = new Error('connection reset') as Error & { request?: object }
      error.request = {}
      throw error
    }
    return { status: 200, data: { ok: true } }
  })

  const result = await fetchURL('https://example.com/network-error', 1)

  assert.deepEqual(result, { ok: true })
  assert.equal(attempts.length, 2)
  assert.ok(attempts[1] - attempts[0] >= 400)
})

test('uses retry-after when the upstream rate limits a request', async (t) => {
  const attempts: number[] = []
  t.mock.method(axios, 'get', async () => {
    attempts.push(Date.now())
    if (attempts.length === 1) {
      const error = new Error('rate limited') as Error & {
        response?: { status: number, headers: Record<string, string> }
      }
      error.response = { status: 429, headers: { 'retry-after': '1' } }
      throw error
    }
    return { status: 200, data: { ok: true } }
  })

  await fetchURL('https://example.com/rate-limited', 1)

  assert.equal(attempts.length, 2)
  assert.ok(attempts[1] - attempts[0] >= 900)
})

test('uses a date retry-after header when the upstream rate limits a request', async (t) => {
  const attempts: number[] = []
  const retryAt = new Date(Math.ceil(Date.now() / 1000) * 1000 + 2000).toUTCString()
  t.mock.method(axios, 'get', async () => {
    attempts.push(Date.now())
    if (attempts.length === 1) {
      const error = new Error('rate limited') as Error & {
        response?: { status: number, headers: Record<string, string> }
      }
      error.response = { status: 429, headers: { 'retry-after': retryAt } }
      throw error
    }
    return { status: 200, data: { ok: true } }
  })

  await fetchURL('https://example.com/rate-limited-date', 1)

  assert.equal(attempts.length, 2)
  assert.ok(attempts[1] - attempts[0] >= 900)
})
