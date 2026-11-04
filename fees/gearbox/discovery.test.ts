import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ChainApi } from '@defillama/sdk'
import { FetchOptions } from '../../adapters/types'
import { ADDRESS_PROVIDER, getDaoTreasury, getGearboxPools } from './discovery'

const block = 19000000
const pool = '0x00000000000000000000000000000000000000ab'
const secondPool = '0x00000000000000000000000000000000000000cd'
const dao = '0x000000000000000000000000000000000000000d'
const zero = '0x0000000000000000000000000000000000000000'
const services = [{ version: 3 as const, pool }]
const options = (api: unknown) => ({ toApi: api, getToBlock: async () => block }) as FetchOptions
const unexpected = async () => { throw new Error('Unexpected RPC call') }

test('undeployed V3.1 provider preserves legacy pools and resolves the historical legacy DAO', async () => {
  const codeReads: Array<[string, number]> = []
  const api = {
    chain: 'ethereum', getBlock: async () => block,
    provider: { getCode: async (target: string, at: number) => { codeReads.push([target, at]); return '0x' } },
    multiCall: async () => ['300'],
    call: async ({ target, permitFailure }: any) => {
      if (target === ADDRESS_PROVIDER) { assert.equal(permitFailure, true); return null }
      assert.equal(target, '0x9ea7b04da02a5373317d745c1571c84aad03321d')
      return dao
    },
  }
  assert.deepEqual(await getGearboxPools(options(api), services), { pools: [pool], daoTreasury: dao })
  assert.deepEqual(codeReads, [[ADDRESS_PROVIDER, block], [ADDRESS_PROVIDER, block]])
})

test('future static pools are excluded only after verifying empty historical bytecode', async () => {
  const api = {
    multiCall: async () => [null],
    call: async () => null,
    provider: { getCode: async (_target: string, at: number) => { assert.equal(at, block); return '0x' } },
  }
  assert.deepEqual(await getGearboxPools(options(api), services), { pools: [], daoTreasury: undefined })
})

test('failed reads of deployed static pools and factories fail closed', async () => {
  const api = { multiCall: async () => [null], call: async () => null, provider: { getCode: async () => '0x1234' } }
  await assert.rejects(getGearboxPools(options(api), services), /Could not read deployed Gearbox pool/)
  await assert.rejects(getGearboxPools(options(api), []), /Could not read deployed Gearbox market factory/)
})

test('an unavailable historical code lookup propagates instead of excluding pools', async () => {
  const api = { multiCall: async () => [null], provider: { getCode: async () => { throw new Error('archive unavailable') } } }
  await assert.rejects(getGearboxPools(options(api), services), /archive unavailable/)
})

test('registered and shutdown configurators and pools are included and deduplicated', async () => {
  const api = {
    provider: { getCode: unexpected },
    call: async ({ abi, params }: any) => {
      if (abi.includes('getShutdownMarketConfigurators')) return ['0xc1', '0xc2']
      if (abi.includes('getMarketConfigurators')) return ['0xC1']
      return Buffer.from(params[0].slice(2), 'hex').toString().startsWith('TREASURY') ? dao : '0xf1'
    },
    multiCall: async ({ abi, calls }: any) => {
      if (abi === 'uint256:version') return ['300']
      if (abi === 'address:contractsRegister') { assert.deepEqual(calls, ['0xc1', '0xc2']); return ['0xr1', '0xr2'] }
      assert.deepEqual(calls, ['0xr1', '0xr2'])
      if (abi.includes('getShutdownPools')) return [[secondPool], []]
      return [[pool.toUpperCase()], [secondPool]]
    },
  }
  assert.deepEqual(await getGearboxPools(options(api), services), { pools: [pool, secondPool], daoTreasury: dao })
})

test('an unconfigured factory still returns the DAO when legacy pools exist', async () => {
  const api = {
    provider: { getCode: unexpected },
    multiCall: async () => ['300'],
    call: async ({ params }: any) => Buffer.from(params[0].slice(2), 'hex').toString().startsWith('TREASURY') ? dao : zero,
  }
  assert.deepEqual(await getGearboxPools(options(api), services), { pools: [pool], daoTreasury: dao })
})

test('a successful DAO contract read does not require the primary provider to support archive getCode', async () => {
  const api = { call: async () => dao, provider: { getCode: unexpected } }
  assert.equal(await getDaoTreasury(api as unknown as ChainApi), dao)
})
