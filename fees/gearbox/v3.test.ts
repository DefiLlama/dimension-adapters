import test from 'node:test'
import assert from 'node:assert/strict'
import { ChainApi } from '@defillama/sdk'
import BigNumber from 'bignumber.js'
import { daoShare, interestAmounts, matchLiquidationRepay, readDaoShare } from './v3'
import adapter from './index'
import * as discovery from './discovery'

const dao = '0xDAO'
const curator = '0xCurator'
const split = (share: number) => ({ initialized: true, receivers: [dao, curator], proportions: [share, 10000 - share] })

test('base and quota interest receive the CM markup without treating markup as lender income', () => {
  const result = interestAmounts('1000', '100', '110', '50', 1000)
  assert.equal(result.interest.toFixed(), '150')
  assert.equal(result.markup.toFixed(), '15')
  assert.throws(() => interestAmounts('1000', '0', '110', 0, 1000))
  assert.throws(() => interestAmounts('1000', '110', '100', 0, 1000))
  assert.equal(interestAmounts('0', '100', '100', 0, 1000).markup.toFixed(), '0')
})

test('DAO share aggregates matching addresses and validates split configuration', () => {
  assert.equal(daoShare(split(5000), dao.toLowerCase()), 0.5)
  assert.equal(daoShare({ initialized: true, receivers: [dao, dao.toLowerCase(), curator], proportions: [1000, 2000, 7000] }, dao), 0.3)
  assert.equal(daoShare(split(0), dao), 0)
  assert.throws(() => daoShare({ ...split(5000), initialized: false }, dao))
  assert.throws(() => daoShare({ ...split(5000), proportions: [5000] }, dao))
  assert.throws(() => daoShare({ ...split(5000), proportions: [5000, 4999] }, dao))
})

test('direct DAO and V300 curator routing need no splitter calls', async () => {
  const api = { call: async () => { throw new Error('unexpected splitter call') } } as any
  assert.equal(await readDaoShare(api, dao.toLowerCase(), 'pool', dao, 310), 1)
  assert.equal(await readDaoShare(api, curator, 'pool', dao, 300), 0)
})

test('token-specific split takes precedence and default is used only when uninitialized', async () => {
  const calls: any[] = []
  const api = { call: async (args: any) => {
    calls.push(args)
    if (args.abi.includes('defaultSplit')) return split(5000)
    return args.params[0] === 'pool' ? split(2500) : { initialized: false, receivers: [], proportions: [] }
  } } as any
  assert.equal(await readDaoShare(api, 'splitter', 'pool', dao, 310), 0.25)
  assert.equal(calls.length, 1)
  assert.equal(await readDaoShare(api, 'splitter', 'asset', dao, 310), 0.5)
  assert.equal(calls.length, 3)
  await assert.rejects(readDaoShare({ call: async () => { throw new Error('RPC unavailable') } } as any, 'splitter', 'asset', dao, 310), /RPC unavailable/)
})

test('batched liquidations consume only the nearest preceding matching-manager repayment', () => {
  const repay = (index: number, manager = 'CM', hash = 'tx') => ({ index, transactionHash: hash, args: { creditManager: manager } })
  const logs = [repay(1), repay(3), repay(6), repay(8, 'other'), repay(9, 'CM', 'otherTx')]
  const used = new Set<any>()
  assert.equal(matchLiquidationRepay({ logIndex: 4, transactionHash: 'tx' }, 'cm', logs, used), logs[1])
  assert.equal(matchLiquidationRepay({ logIndex: 10, transactionHash: 'tx' }, 'cm', logs, used), logs[2])
  assert.equal(used.size, 2)
  assert.throws(() => matchLiquidationRepay({ logIndex: 0, transactionHash: 'tx' }, 'cm', logs, used), /Missing/)
})

test('fetch keeps the accounting identity, excludes ordinary Repay profit, and uses the correct split token', async () => {
  const originals = { pools: discovery.getGearboxPools, dao: discovery.getDaoTreasury, call: ChainApi.prototype.call, multi: ChainApi.prototype.multiCall }
  const splitTokens: string[] = []
  const pool = 'pool', cm = 'cm', facade = 'facade', asset = 'asset'
  const totals = () => ({ total: new BigNumber(0), add(_token: string, amount: string) {
    // The real SDK stores raw units as BigInt, so fractional units must be rounded.
    assert.doesNotThrow(() => BigInt(amount))
    this.total = this.total.plus(amount)
  } })
  try {
    ;(discovery as any).getGearboxPools = async () => ({ pools: [pool], daoTreasury: dao })
    ;(discovery as any).getDaoTreasury = async () => dao
    ChainApi.prototype.call = async function (args: any): Promise<any> {
      if (args.abi === 'address:treasury') return 'splitter'
      if (args.abi.includes('tokenSplits')) { splitTokens.push(args.params[0]); return split(args.params[0] === pool ? 5000 : 2000) }
      throw new Error(`Unexpected call: ${args.abi}`)
    }
    ChainApi.prototype.multiCall = async function (args: any): Promise<any> {
      assert.match(args.abi, /calcDebtAndCollateral/)
      return args.calls.map(() => ({ accruedFees: '10' }))
    }
    const endApi = {
      call: ChainApi.prototype.call,
      multiCall: async ({ abi, calls }: any) => {
        if (abi.includes('tokenSplits')) {
          assert.deepEqual(calls, [{ target: 'splitter', params: [pool] }])
          splitTokens.push(calls[0].params[0])
          return [split(5000)]
        }
        if (abi.includes('defaultSplit')) return calls.map(() => split(5000))
        if (abi === 'address:asset') return [asset]
        if (abi === 'address:treasury') return ['splitter']
        if (abi === 'uint256:version') return [310]
        if (abi.includes('creditManagers()')) return [[cm]]
        if (abi === 'uint256:baseInterestIndex') return ['110']
        if (abi === 'uint256:quotaRevenue') return ['0']
        if (abi.includes('creditManagerBorrowed')) return ['1001']
        if (abi.includes('fees')) return [{ feeInterest: '1000' }]
        if (abi === 'address:creditFacade') return [facade]
        throw new Error(`Unexpected multicall: ${abi}`)
      },
    }
    const full = [
      { address: facade, blockNumber: 20, logIndex: 3, transactionHash: 'tx', args: { creditAccount: 'account1' } },
      { address: facade, blockNumber: 20, logIndex: 7, transactionHash: 'tx', args: { creditAccount: 'account2' } },
    ]
    const repays = [
      { logIndex: 0, transactionHash: 'tx', args: { creditManager: cm, profit: '100000', loss: '0' } },
      { logIndex: 2, transactionHash: 'tx', args: { creditManager: cm, profit: '30', loss: '0' } },
      { logIndex: 6, transactionHash: 'tx', args: { creditManager: cm, profit: '0', loss: '500' } },
    ]
    const partial = [{ address: facade, blockNumber: 20, logIndex: 10, transactionHash: 'tx', args: { token: 'collateral', fee: '10' } }]
    const options = {
      chain: 'plasma', createBalances: totals, toApi: endApi, fromApi: { multiCall: async ({ abi }: any) => abi === 'address:creditFacade' ? [facade] : ['100'] },
      fromTimestamp: 1000, toTimestamp: 87400, getFromBlock: async () => 10, getToBlock: async () => 30,
      getLogs: async ({ eventAbi, fromBlock }: any) => {
        assert.equal(fromBlock, 11)
        if (eventAbi.includes('PartiallyLiquidate')) return partial
        if (eventAbi.includes('LiquidateCreditAccount')) return full
        return repays
      },
    }
    const balances = await (adapter.fetch as any)(options)
    assert.equal(balances.dailyFees.total.toFixed(), '140')
    assert.equal(balances.dailyRevenue.total.toFixed(), '17')
    assert.equal(balances.dailyProtocolRevenue.total.toFixed(), '17')
    assert.equal(balances.dailyProtocolRevenue, balances.dailyRevenue)
    assert.equal(balances.dailySupplySideRevenue.total.toFixed(), '123')
    assert.equal(balances.dailyFees.total.toFixed(), balances.dailyRevenue.total.plus(balances.dailySupplySideRevenue.total).toFixed())
    assert.deepEqual(splitTokens, [pool, pool, pool, asset])
  } finally {
    ;(discovery as any).getGearboxPools = originals.pools
    ;(discovery as any).getDaoTreasury = originals.dao
    ChainApi.prototype.call = originals.call
    ChainApi.prototype.multiCall = originals.multi
  }
})
