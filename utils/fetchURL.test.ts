import assert from 'node:assert/strict'
import { test } from 'node:test'
import axios from 'axios'
import { proxiedFetch } from './fetchURL'

test('does not override tls verification for proxy requests', async (t) => {
  const previousProxyAuth = process.env.PROXY_AUTH
  t.after(() => {
    if (previousProxyAuth === undefined) delete process.env.PROXY_AUTH
    else process.env.PROXY_AUTH = previousProxyAuth
  })
  process.env.PROXY_AUTH = 'proxy.example:user:password:8443'

  const get = t.mock.fn(async () => ({ data: { ok: true } }))
  const create = t.mock.method(axios, 'create', () => ({ get }) as any)

  const result = await proxiedFetch('https://example.com/data')

  assert.deepEqual(result, { ok: true })
  assert.equal(create.mock.calls.length, 1)
  assert.equal(create.mock.calls[0].arguments[0]?.httpsAgent, undefined)
  assert.deepEqual(get.mock.calls[0].arguments, [
    'https://example.com/data',
    {
      proxy: {
        protocol: 'https',
        host: 'proxy.example',
        port: 8443,
        auth: { username: 'user', password: 'password' },
      },
    },
  ])
})
