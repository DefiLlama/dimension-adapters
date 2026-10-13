import { test } from 'node:test'
import assert from 'node:assert/strict'
import ftusd from '../fees/flying-tulip-ftusd'
import type { FetchOptions } from '../adapters/types'

class ExactBalances {
  values: Record<string, bigint> = {}
  add(token: string, amount: string | bigint, label: string) {
    const key = `${token.toLowerCase()}:${label}`
    this.values[key] = (this.values[key] ?? 0n) + BigInt(amount)
  }
}
const targets: Record<string, string> = {
  bsc: '0x7d73863178a3ecb9767f0be1bf50f55305a52743',
  ethereum: '0xaa48ecbc843cf7e9a29155d112b8cb27902bd23c',
  sonic: '0x0c6f8ec81c3ea5bff06f6cd0791780f9f050ee31',
}
const usdc: Record<string, string> = {
  bsc: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  ethereum: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
  sonic: '0x29219dd400f2bf60e5a23d13be72b486d4038894',
}

test('ftUSD registers BSC from deployment without changing existing chain starts', () => {
  assert.equal(ftusd.adapter?.bsc?.start, '2026-07-08')
  assert.equal(ftusd.adapter?.ethereum?.start, '2026-01-26')
  assert.equal(ftusd.adapter?.sonic?.start, '2026-01-26')
})

async function run(chain: string, mint: string[], redeem: string[], fail = false) {
  const options = {
    chain,
    createBalances: () => new ExactBalances(),
    getLogs: async ({ target, eventAbi }: { target: string; eventAbi: string }) => {
      assert.equal(target.toLowerCase(), targets[chain])
      if (fail) throw new Error('RPC unavailable')
      const amounts = eventAbi.startsWith('event Minted(') ? mint : redeem
      // Gross transaction amounts must not enter fee accounting.
      return amounts.map(feeFtUSDAmount => ({ feeFtUSDAmount, collateralAmount: '999999999999999999999999', ftUSDAmount: '999999999999' }))
    },
  } as unknown as FetchOptions
  assert.ok(ftusd.fetch)
  return await ftusd.fetch(options)
}

test('BSC fees preserve one atomic ftUSD unit and amounts above Number precision', async () => {
  const result = await run('bsc', ['1', '9007199254740993'], ['1234567'])
  const expected = {
    [`${usdc.bsc}:Mint Fee`]: 9007199254740994n * 10n ** 12n,
    [`${usdc.bsc}:Redeem Fee`]: 1234567n * 10n ** 12n,
  }
  for (const metric of [result.dailyFees, result.dailyRevenue, result.dailyProtocolRevenue]) {
    assert.deepEqual((metric as unknown as ExactBalances).values, expected)
  }
  assert.equal(result.dailySupplySideRevenue, 0)
})

for (const chain of ['ethereum', 'sonic']) {
  test(`${chain} fee units remain unchanged`, async () => {
    const result = await run(chain, ['1', '9007199254740993'], ['1234567'])
    assert.deepEqual((result.dailyFees as unknown as ExactBalances).values, {
      [`${usdc[chain]}:Mint Fee`]: 9007199254740994n,
      [`${usdc[chain]}:Redeem Fee`]: 1234567n,
    })
  })
}

test('BSC no-activity window returns empty fees and real log failures propagate', async () => {
  const result = await run('bsc', [], [])
  assert.deepEqual((result.dailyFees as unknown as ExactBalances).values, {})
  await assert.rejects(run('bsc', [], [], true), /RPC unavailable/)
})

import lend from '../fees/flying-tulip-lend'
async function runLend({ chain = 'bsc', failure = '', debt = '1000000000000000000000', apr = '50000000000000000', tradeFee = '0', tradeEvents = {} as Record<string, { sellToken: string; feeAmount: string }[]>, liquidationFees = [] as { asset: string; amount: string }[] } = {}) {
  const rows = { state: [0n, BigInt(debt), 0n, 10n ** 18n], cfg: ['0x1111111111111111111111111111111111111111', 150, false, true, true] }
  const options = {
    chain, startTimestamp: 1000, endTimestamp: 4600,
    createBalances: () => new ExactBalances(),
    toApi: { multiCall: async ({ abi, calls, permitFailure }: { abi: string; calls: unknown[]; permitFailure?: boolean }) => {
      const kind = abi.includes('assetState') ? 'state' : abi.includes('assetCfg') ? 'cfg' : 'apr'
      if (failure === kind) {
        if (!permitFailure) throw new Error(`RPC ${kind} unavailable`)
        return calls.map(() => null)
      }
      if (kind === 'apr') return calls.map(() => [BigInt(apr)])
      return calls.map((_, i) => kind === 'state' ? (i === 0 ? rows.state : [0n, 0n, 0n, 0n]) :
        (failure === 'missing-irm' ? ['0x0000000000000000000000000000000000000000',150,false,true,true] : rows.cfg))
    } },
    getLogs: async ({ eventAbi }: { eventAbi: string }) => {
      if (failure === 'logs') throw new Error('log source unavailable')
      const eventName = /^event (\w+)\(/.exec(eventAbi)?.[1]
      if (eventName === 'LiquidationFeeCollected') return liquidationFees
      if (eventName && tradeEvents[eventName]) return tradeEvents[eventName]
      if (eventName === 'OpenLeverageFilled') return [{ sellToken: usdc[chain], feeAmount: tradeFee }]
      return []
    },
  } as unknown as FetchOptions
  const fetch = lend.adapter?.[chain]?.fetch
  assert.ok(fetch)
  return await fetch(options)
}

test('Lend preserves interest on paused debt and separates it from protocol trading fees', async () => {
  const result = await runLend({ tradeFee: '123' })
  // 1000 units, 5% APR, one hour, independently reduced: 50 units / 8760 hours.
  const interest = 50n * 10n ** 18n / 8760n
  assert.deepEqual((result.dailyFees as unknown as ExactBalances).values, {
    [`${usdc.bsc}:Borrow Interest`]: interest,
    [`${usdc.bsc}:Open Leverage Fee`]: 123n,
  })
  assert.deepEqual((result.dailySupplySideRevenue as unknown as ExactBalances).values, {
    [`${usdc.bsc}:Borrow Interest To Lenders`]: interest,
  })
  assert.deepEqual((result.dailyRevenue as unknown as ExactBalances).values, {
    [`${usdc.bsc}:Open Leverage Fee`]: 123n,
  })
})

for (const chain of ['ethereum', 'sonic']) {
  test(`${chain} Lend keeps the existing raw interest and trade-fee allocation`, async () => {
    const result = await runLend({ chain, tradeFee: '123' })
    const interest = 50n * 10n ** 18n / 8760n
    assert.deepEqual((result.dailyFees as unknown as ExactBalances).values, {
      [`${usdc[chain]}:Borrow Interest`]: interest,
      [`${usdc[chain]}:Open Leverage Fee`]: 123n,
    })
    assert.deepEqual((result.dailyRevenue as unknown as ExactBalances).values, {
      [`${usdc[chain]}:Open Leverage Fee`]: 123n,
    })
  })
}

for (const failure of ['state', 'cfg', 'apr', 'missing-irm', 'logs']) {
  test(`BSC Lend surfaces ${failure} failure instead of reporting zero income`, async () => {
    await assert.rejects(runLend({ failure }), /unavailable|interest rate model/i)
  })
}

test('zero debt or a genuine zero APR yields zero interest', async () => {
  for (const options of [{ debt: '0' }, { apr: '0' }]) {
    const result = await runLend(options)
    assert.deepEqual((result.dailyFees as unknown as ExactBalances).values, {})
  }
})

test('BSC direct and flash trading events and liquidation fees enter protocol revenue once', async () => {
  const tradeEvents = Object.fromEntries([
    ['OpenLeverageFilled', '2'], ['OpenLeverageFlashFilled', '3'],
    ['CloseLeverageFilled', '5'], ['CloseLeverageFlashFilled', '7'],
    ['CollateralSwapFilled', '11'], ['CollateralSwapFlashFilled', '13'],
  ].map(([name, feeAmount]) => [name, [{ sellToken: usdc.bsc, feeAmount }]]))
  const result = await runLend({
    debt: '0', tradeEvents,
    liquidationFees: [{ asset: usdc.bsc, amount: '17' }],
  })
  const expected = {
    [`${usdc.bsc}:Open Leverage Fee`]: 5n,
    [`${usdc.bsc}:Close Leverage Fee`]: 12n,
    [`${usdc.bsc}:Collateral Swap Fee`]: 24n,
    [`${usdc.bsc}:RFQ Liquidation Fee`]: 17n,
  }
  for (const metric of [result.dailyFees, result.dailyRevenue, result.dailyProtocolRevenue]) {
    assert.deepEqual((metric as unknown as ExactBalances).values, expected)
  }
  assert.deepEqual((result.dailySupplySideRevenue as unknown as ExactBalances).values, {})
})
