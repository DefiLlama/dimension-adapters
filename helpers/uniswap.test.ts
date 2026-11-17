import assert from 'node:assert/strict'
import { mock, test } from 'node:test'
import { Balances, ChainApi, cache, coins } from '@defillama/sdk'
import { Interface } from 'ethers'
import { FetchOptions } from '../adapters/types'
import pancake from '../dexs/pancakeswap-v3'
import * as lists from './lists'
import { getUniV3LogAdapter } from './uniswap'
import primary from './uniswap-pancake-primary.json'

// Offline I/O fixtures; all fee allocation, selected-leg pricing and balance accumulation run production code.
// node --test -r ts-node/register/transpile-only helpers/uniswap.test.ts
const WETH = '0x4200000000000000000000000000000000000006'
const OTHER = '0x0000000000000000000000000000000000000001'
const POOL = '0x0000000000000000000000000000000000000010'
const FACTORY = '0x0000000000000000000000000000000000000020'
const slot = (token0 = 3200, token1 = token0, sqrtPriceX96 = '1') => ({ sqrtPriceX96, feeProtocol: token0 + 65536 * token1 })
const positioned = (args: any, blockNumber = 110, logIndex = 1): any => ({ args, blockNumber, logIndex })
const swap = (amount0 = '40000', amount1 = '-40000', block = 110, index = 1) => positioned({ amount0, amount1 }, block, index)
const change = (old0: number, old1: number, new0: number, new1: number, block = 110, index = 2) =>
  positioned({ feeProtocol0Old: old0, feeProtocol1Old: old1, feeProtocol0New: new0, feeProtocol1New: new1 }, block, index)
const initialize = (block = 110, index = 0) => positioned({ sqrtPriceX96: '1', tick: 0 }, block, index)

type Pool = {
  address?: string; token0?: string; token1?: string; fee?: number
  opening?: any; closing?: any; swaps?: any[]; changes?: any[]; init?: any[]
}
type Scenario = {
  pools?: Pool[]; fromBlock?: number; toBlock?: number
  failOnce?: string[]; // `${block}:${pool}`
  omitSwapGroup?: boolean;
  config?: any; // When provided, exercise a legacy/static helper caller instead of the Pancake adapter.
}

async function run(scenario: Scenario = {}) {
  const fromBlock = scenario.fromBlock ?? 100, toBlock = scenario.toBlock ?? 120
  const pools = (scenario.pools ?? [{}]).map(pool => ({
    address: POOL, token0: WETH, token1: OTHER, fee: 2500,
    opening: slot(), closing: slot(), swaps: [swap()], changes: [], init: [], ...pool,
  }))
  const reads: { block: number; calls: string[] }[] = []
  const logReads: any[] = []
  const failed = new Set<string>()
  const poolByAddress = (address: string) => {
    const pool = pools.find(pool => pool.address.toLowerCase() === address.toLowerCase())
    assert.ok(pool, `unexpected pool ${address}`)
    return pool
  }
  mock.method(lists, 'getDexTokensBlacklisted', async () => [])
  mock.method(coins, 'getPrices', async (tokens: string[]) => Object.fromEntries(tokens.map(token => [token, { price: 1 }])))
  mock.method(Balances.prototype, 'getUSDValue', async () => 1000)
  mock.method(cache, 'readCache', async () => {
    const algebra = scenario.config?.isAlgebraV3
    const iface = new Interface([algebra
      ? 'event Pool(address indexed token0, address indexed token1, address pool)'
      : 'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)'])
    return { logs: pools.map(pool => iface.encodeEventLog(iface.fragments[0] as any, algebra
      ? [pool.token0, pool.token1, pool.address]
      : [pool.token0, pool.token1, pool.fee, 1, pool.address])) }
  })
  mock.method(ChainApi.prototype, 'multiCall', async function({ abi, calls }: any) {
    if (abi === 'erc20:balanceOf') return calls.map(() => '1000000000000000000000')
    if (abi.includes('slot0')) reads.push({ block: this.block, calls: [...calls] })
    return calls.map((address: string) => {
      const pool = poolByAddress(address)
      if (abi.includes('slot0')) {
        const key = `${this.block}:${address}`
        if (scenario.failOnce?.includes(key) && !failed.has(key)) { failed.add(key); return null }
        assert.ok(this.block === fromBlock - 1 || this.block === toBlock, 'use opening getFromBlock()-1, not fromApi')
        return this.block === fromBlock - 1 ? pool.opening : pool.closing
      }
      if (abi.includes('globalState')) return { fee: pool.fee, communityFee: 125 }
      if (abi.includes('token0')) return pool.token0
      if (abi.includes('token1')) return pool.token1
      if (abi.includes('fee()')) return pool.fee
      throw new Error(`unexpected call ${abi}`)
    })
  })
  const options = {
    chain: 'base', api: new ChainApi({ chain: 'base', block: toBlock }),
    fromApi: new ChainApi({ chain: 'base', block: fromBlock + 50 }),
    getFromBlock: async () => fromBlock, getToBlock: async () => toBlock,
    createBalances: () => new Balances({ chain: 'base' }),
    getLogs: async (params: any) => {
      logReads.push(params)
      assert.equal(params.flatten, false)
      const key = params.eventAbi.includes('SetFee') ? 'changes' : params.eventAbi.includes('Initialize') ? 'init' : 'swaps'
      if (key === 'swaps' && scenario.omitSwapGroup) return []
      return params.targets.map((address: string) => poolByAddress(address)[key].map((log: any) =>
        params.onlyArgs === false ? log : log.args))
    },
  } as unknown as FetchOptions
  try {
    const output = scenario.config
      ? await getUniV3LogAdapter({ pools: pools.map(pool => pool.address), ...scenario.config })(options)
      : await (pancake.adapter!.base.fetch as any)(options)
    const total = (metric: string) => Object.values(output[metric]?.getBalances() ?? {}).reduce((sum: number, value) => sum + Number(value), 0)
    return { output, reads, logReads, totals: Object.fromEntries(Object.keys(output).map(metric => [metric, total(metric)])) as Record<string, number> }
  } finally {
    mock.restoreAll()
  }
}

function close(actual: number, expected: number) {
  assert.ok(Math.abs(actual - expected) <= Math.max(1e-10, Math.abs(expected) * 1e-12), `${actual} != ${expected}`)
}
function allocations(result: Awaited<ReturnType<typeof run>>, fees: number, revenue: number, treasury: number, holders: number, lp: number) {
  for (const [metric, expected] of Object.entries({ dailyFees: fees, dailyRevenue: revenue, dailyProtocolRevenue: treasury, dailyHoldersRevenue: holders, dailySupplySideRevenue: lp }))
    close(result.totals[metric], expected)
  close(result.totals.dailyRevenue + result.totals.dailySupplySideRevenue, result.totals.dailyFees)
  close(result.totals.dailyProtocolRevenue + result.totals.dailyHoldersRevenue, result.totals.dailyRevenue)
}

test('asymmetric input cuts are independent of the output token chosen for pricing', async () => {
  // Token0 input, but token1 is the priced output.
  const forward = await run({ pools: [{ token0: OTHER, token1: WETH, opening: slot(1200, 3200), closing: slot(1200, 3200) }] })
  allocations(forward, 100, 12, 12, 0, 88)
  assert.deepEqual(forward.output.dailyFees.getBalances(), { [`base:${WETH}`]: 100 })
  // Token1 input, but token0 is the priced output.
  allocations(await run({ pools: [{ opening: slot(1200, 3200), closing: slot(1200, 3200), swaps: [swap('-40000', '40000')] }] }), 100, 32, 9, 23, 68)
})

test('all four tiers keep the exact documented cut, treasury and holder split', async () => {
  for (const [fee, cut, treasury, holders] of [[100, 3300, 18, 15], [500, 3400, 19, 15], [2500, 3200, 9, 23], [10000, 3200, 9, 23]]) {
    const amount = String(100 * 1e6 / fee)
    const pool = { fee, opening: slot(cut), closing: slot(cut), swaps: [swap(amount, `-${amount}`)] }
    allocations(await run({ pools: [pool] }), 100, treasury + holders, treasury, holders, 100 - treasury - holders)
    // A one-unit deviation must not broaden default-cut matching.
    allocations(await run({ pools: [{ ...pool, opening: slot(cut + 1), closing: slot(cut + 1) }] }), 100, (cut + 1) / 100, (cut + 1) / 100, 0, 100 - (cut + 1) / 100)
  }
})

test('same-block switch preserves holders before the change and resets them after it', async () => {
  const result = await run({ pools: [{ closing: slot(1200), changes: [change(3200, 3200, 1200, 1200)], swaps: [swap('40000', '-40000', 110, 3), swap()] }] })
  allocations(result, 200, 44, 21, 23, 156)
  assert.deepEqual(result.reads.map(read => read.block), [120, 99])
  assert.ok(result.logReads.every(read => read.onlyArgs === false))
})

test('one-sided zero and default -> zero -> default never retain a stale holder allocation', async () => {
  allocations(await run({ pools: [{ opening: slot(0, 3200), closing: slot(0, 3200) }] }), 100, 0, 0, 0, 100)
  allocations(await run({ pools: [{ opening: slot(0, 3200), closing: slot(0, 3200), swaps: [swap('-40000', '40000')] }] }), 100, 32, 9, 23, 68)
  allocations(await run({ pools: [{ changes: [change(0, 0, 3200, 3200, 110, 4), change(3200, 3200, 0, 0)], swaps: [swap('40000', '-40000', 110, 5), swap(), swap('40000', '-40000', 110, 3)] }] }), 300, 64, 18, 46, 236)
})

test('unsorted multiple changes, identical duplicates and multiple pools stay isolated', async () => {
  const first = change(3200, 3200, 1200, 1200)
  const last = change(1200, 1200, 3200, 3200, 110, 4)
  const swaps = [swap('40000', '-40000', 110, 5), swap(), swap('40000', '-40000', 110, 3)]
  const result = await run({ pools: [
    { changes: [last, first, { ...first }], swaps: [...swaps, { ...swaps[0] }] },
    { address: '0x0000000000000000000000000000000000000011', opening: slot(1200), closing: slot(1200) },
  ] })
  allocations(result, 400, 88, 42, 46, 312)
  assert.equal(result.logReads.filter(read => read.eventAbi.includes('SetFeeProtocol')).length, 1)
})

test('batched reads retry only failed entries at both boundaries', async () => {
  const other = '0x0000000000000000000000000000000000000011'
  const result = await run({ pools: [{}, { address: other }], failOnce: [`120:${POOL}`, `99:${other}`] })
  allocations(result, 200, 64, 18, 46, 136)
  assert.deepEqual(result.reads, [
    { block: 120, calls: [POOL, other] }, { block: 120, calls: [POOL] },
    { block: 99, calls: [POOL, other] }, { block: 99, calls: [other] },
  ])
})

test('verified Initialize permits new and previously uninitialized pools, with or without changes', async () => {
  for (const opening of [null, slot(0, 0, '0')]) {
    allocations(await run({ pools: [{ opening, init: [initialize()] }] }), 100, 32, 9, 23, 68)
    allocations(await run({ pools: [{ opening, closing: slot(1200), init: [initialize()], changes: [change(3200, 3200, 1200, 1200)], swaps: [swap(), swap('40000', '-40000', 110, 3)] }] }), 200, 44, 21, 23, 156)
  }
})

test('unreadable established state and unverified or late initialization reject', async () => {
  for (const pool of [
    { opening: null }, { opening: slot(0, 0, '0') }, { closing: null },
    { opening: null, changes: [change(3200, 3200, 1200, 1200)], closing: slot(1200) },
    { opening: null, init: [initialize(110, 2)] },
    { opening: null, init: [initialize(110, 3)], changes: [change(3200, 3200, 1200, 1200)], closing: slot(1200) },
    { opening: null, init: [initialize(110, 0), initialize(111, 0)] },
    { opening: null, init: [positioned({ sqrtPriceX96: '0', tick: 0 }, 110, 0)] },
  ]) await assert.rejects(run({ pools: [pool] }), /pancakeV3:/)
})

test('missing or inconsistent old/new changes and closing state reject', async () => {
  for (const pool of [
    { closing: slot(1200) },
    { changes: [change(1200, 3200, 3200, 3200)] },
    { changes: [change(3200, 3200, 1200, 1200)] },
    { changes: [change(3200, 3200, 1200, 1200), change(1200, 0, 3200, 3200, 111, 0)] },
    { changes: [change(3200, 3200, 10001, 3200)] },
    { opening: { sqrtPriceX96: '1' } },
    { closing: { sqrtPriceX96: '1', feeProtocol: -1 } },
  ]) await assert.rejects(run({ pools: [pool] }), /pancakeV3:/)
})

test('log integrity rejects missing positions, wrong emitters, removed/out-of-window logs and conflicts', async () => {
  await assert.rejects(run({ omitSwapGroup: true }), /missing grouped swap logs/)
  for (const bad of [
    { args: swap().args }, { ...swap(), logIndex: -1 }, { ...swap(), blockNumber: 110.5 },
    { ...swap(), address: OTHER }, { ...swap(), removed: true }, { ...swap(), blockNumber: 99 }, { ...swap(), blockNumber: 121 },
  ]) await assert.rejects(run({ pools: [{ swaps: [bad] }] }), /pancakeV3:|getPositionedLogArgs:/)
  await assert.rejects(run({ pools: [{ swaps: [swap(), swap('50000', '-50000')] }] }), /conflicting logs/)
  await assert.rejects(run({ pools: [{ changes: [change(3200, 3200, 3200, 3200), change(3200, 3200, 1200, 1200)] }] }), /conflicting logs/)
  await assert.rejects(run({ pools: [{ changes: [{ args: change(3200, 3200, 3200, 3200).args }] }] }), /getPositionedLogArgs:/)
  await assert.rejects(run({ pools: [{ changes: [change(3200, 3200, 3200, 3200, 110, 1)] }] }), /swap conflicts/)
})

test('SDK position aliases, positive input with zero output, and signed integer validation', async () => {
  const args = swap().args
  allocations(await run({ pools: [{ swaps: [{ args, block_number: '110', log_index: '1' }] }] }), 100, 32, 9, 23, 68)
  allocations(await run({ pools: [{ swaps: [swap('40000', '0'), swap('0', '0', 110, 2)] }] }), 100, 32, 9, 23, 68)
  allocations(await run({ pools: [{ token0: OTHER, token1: WETH, swaps: [swap('40000', '0')] }] }), 0, 0, 0, 0, 0)
  allocations(await run({ pools: [{ token0: OTHER, token1: WETH, swaps: [swap('0', '40000')] }] }), 100, 32, 9, 23, 68)
  for (const [a, b] of [['1', '1'], ['-1', '-1'], ['-1', '0'], ['0', '-1']])
    await assert.rejects(run({ pools: [{ swaps: [swap(a, b)] }] }), /invalid swap direction/)
})

test('legacy dynamic callbacks still run once per pool with closing ratios and no input cut', async () => {
  const seen: any[] = []
  const result = await run({ pools: [{ closing: slot(0x54, 0), swaps: [swap(), swap('-40000', '40000', 111)] }], config: {
    dynamicProtocolFees: true,
    getRevenueRatio: (props: any) => { seen.push(props); return { _revenueRatio: 0.225, _protocolRevenueRatio: 0.1, _holdersRevenueRatio: 0.125 } },
  } })
  allocations(result, 200, 45, 20, 25, 155)
  assert.equal(seen.length, 1)
  assert.equal(seen[0].protocolFeeRatioToken0, 0.25)
  assert.equal(seen[0].protocolFeeRatioToken1, 0.2)
  assert.equal(seen[0].protocolFeeRatio, undefined)
  assert.deepEqual(result.reads.map(read => read.block), [120])
  assert.equal(result.logReads.length, 1)
})

test('static overrides keep precedence, including zero, on both legacy and Pancake paths', async () => {
  for (const dynamicProtocolFees of [false, 'pancakeV3']) {
    const result = await run({ config: { dynamicProtocolFees, revenueRatio: 0, protocolRevenueRatio: 0, holdersRevenueRatio: 0,
      getRevenueRatio: () => { throw new Error('static revenue must bypass callback') },
    } })
    allocations(result, 100, 0, 0, 0, 100)
  }
  allocations(await run({ config: { dynamicProtocolFees: 'pancakeV3', protocolRevenueRatio: 0, holdersRevenueRatio: 0,
    getRevenueRatio: () => ({ _revenueRatio: 0, _protocolRevenueRatio: 0.2, _holdersRevenueRatio: 0.1 }),
  } }), 100, 0, 0, 0, 100)
})

test('Algebra callbacks and existing feeFromSlot0 replay keep their behavior', async () => {
  let calls = 0
  const algebra = await run({ config: { factory: FACTORY, isAlgebraV3: true, algebraCommunityFee: true,
    getRevenueRatio: (props: any) => { calls++; assert.equal(props.communityFeeRatio, 0.125); return { _revenueRatio: 0.125 } },
  } })
  close(algebra.totals.dailyRevenue, 12.5)
  assert.equal(calls, 1)
  assert.equal(algebra.reads.length, 0)
  const replay = await run({ pools: [{ opening: { fee: 2500 }, closing: { fee: 5000 }, changes: [positioned({ feeOld: 2500, feeNew: 5000 }, 110, 2)], swaps: [swap(), swap('40000', '-40000', 110, 3)] }], config: { feeFromSlot0: true, revenueRatio: 0.1 } })
  close(replay.totals.dailyFees, 300)
  close(replay.totals.dailyRevenue, 30)
  assert.deepEqual(replay.reads.map(read => read.block), [120, 99])
})

test('pinned Base change replays six old-cut and eighteen new-cut swaps without changing valuation', async () => {
  const iface = new Interface(primary.abi)
  const calls = primary.calls as Record<string, string>
  const decoded = primary.logs.map(log => ({ ...log, ...iface.parseLog(log)!, blockNumber: Number(log.blockNumber), logIndex: Number(log.logIndex) }))
  const swaps = decoded.filter(log => log.name === 'Swap')
  const changes = decoded.filter(log => log.name === 'SetFeeProtocol')
  assert.equal(changes.length, 1)
  assert.deepEqual([...changes[0].args].map(String), ['3300', '3300', '1200', '1200'])
  assert.equal(swaps.filter(log => log.blockNumber < changes[0].blockNumber || log.blockNumber === changes[0].blockNumber && log.logIndex < changes[0].logIndex).length, 6)
  assert.equal(swaps.length, 24)
  const exact = swaps.reduce((totals, log) => [totals[0] + log.args.protocolFeesToken0, totals[1] + log.args.protocolFeesToken1], [0n, 0n])
  assert.deepEqual(exact.map(String), primary.exactProtocolFees)
  const result = await run({ fromBlock: primary.fromBlock, toBlock: primary.toBlock, pools: [{
    address: primary.pool, fee: Number(iface.decodeFunctionResult('fee', calls[`fee:${primary.toBlock}`])[0]),
    token0: iface.decodeFunctionResult('token0', calls[`token0:${primary.toBlock}`])[0],
    token1: iface.decodeFunctionResult('token1', calls[`token1:${primary.toBlock}`])[0],
    opening: iface.decodeFunctionResult('slot0', calls[`slot0:${primary.fromBlock - 1}`]),
    closing: iface.decodeFunctionResult('slot0', calls[`slot0:${primary.toBlock}`]), swaps: [...swaps].reverse(), changes,
  }] })
  const e = primary.expected
  allocations(result, e.fees, e.revenue, e.protocol, e.holders, e.supply)
  close(result.totals.dailyVolume, 4535762049206414300)
  // Exact input-token accrual is evidence, not the selected-leg fee approximation used by this adapter.
  assert.notEqual(Number(exact[0]), result.totals.dailyRevenue)
})
