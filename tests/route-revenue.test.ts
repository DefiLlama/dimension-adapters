import assert from 'node:assert/strict';
import test from 'node:test';
import { Balances } from '@defillama/sdk';
import { FetchOptions } from '../adapters/types';
import adapter from '../aggregators/route';

const manager = '0xda5790345fd25878e5186ebd98823814188acfbe';
const hook = '0xe5e702641ea86f4ae6cc3cdaed2b886f976be044';
const receiver = '0xcceb9655af6877d5c8c2919902c356bed71fa1fc';
const eth = 'robinhood:0x0000000000000000000000000000000000000000';
const deploymentTime = 1789087787;
// First successful batch: 0x441e085960be4a8350fdd4f3c7891774dfef483eb981bbd10f22410368717c19.
const execution = {
  sequence: '0', revenue: '212473329768047790', buybackEth: '74365665418816726',
  lpBudget: '63741998930414337', vaultEth: '74365665418816727',
  buybackTokens: '39355149636354623928790', positionId: '2397563', liquidityAdded: '22446318522513734051',
};

async function run({ credits = [] as any[], executions = [] as any[], fees = [] as any[], end = deploymentTime + 3600, fail = false } = {}) {
  const calls: any[] = [];
  const options = {
    chain: 'robinhood', toTimestamp: end,
    createBalances: () => new Balances({ chain: 'robinhood', timestamp: end }),
    getLogs: async (query: any) => {
      calls.push(query);
      if (query.eventAbi.startsWith('event Executed')) {
        assert.equal(query.target, manager);
        if (fail) throw new Error('RPC unavailable');
        return executions;
      }
      if (query.eventAbi.startsWith('event Credited')) return credits;
      if (query.eventAbi.startsWith('event Settled')) return fees;
      return [];
    },
  } as unknown as FetchOptions;
  const result = await (adapter.fetch as (options: FetchOptions) => Promise<any>)(options);
  return { result, calls };
}

const amount = (balance: Balances) => BigInt(balance.getBalances()[eth] ?? '0');

test('buybacks use ETH actually spent, excluding LP purchases and vault payments', async () => {
  const { result } = await run({ executions: [execution] });
  assert.equal(amount(result.dailyHoldersRevenue), BigInt(execution.buybackEth));
  assert.equal(amount(result.dailyProtocolRevenue), -BigInt(execution.buybackEth));
  assert.equal(amount(result.dailyFees), 0n);
  assert.equal(amount(result.dailyRevenue), 0n);
  assert.equal(adapter.allowNegativeValue, true);
});

test('fee sources stay separate and an allocation never creates more revenue', async () => {
  const { result } = await run({
    credits: [
      { recipient: manager.toUpperCase(), depositor: hook.toUpperCase(), amount: '100000000000000001' },
      { recipient: manager, depositor: receiver, amount: '999999999999999999' },
      { recipient: receiver, depositor: hook, amount: '999999999999999999' },
    ],
    fees: [{ tokenOut: eth.split(':')[1], feeAmount: '300000000000000007' }],
    executions: [execution],
  });
  const total = 400000000000000008n;
  assert.equal(amount(result.dailyFees), total);
  assert.equal(amount(result.dailyRevenue), total);
  assert.equal(amount(result.dailyProtocolRevenue) + amount(result.dailyHoldersRevenue), total);
  assert.notEqual(result.dailyProtocolRevenue, result.dailyRevenue);
  assert.equal(amount(result.dailyFees._breakdownBalances['Creator Fees']), 100000000000000001n);
  assert.equal(amount(result.dailyFees._breakdownBalances['Swap Fees']), 300000000000000007n);
  for (const [metric, dimension] of [['Fees', 'dailyFees'], ['Revenue', 'dailyRevenue'], ['ProtocolRevenue', 'dailyProtocolRevenue'], ['HoldersRevenue', 'dailyHoldersRevenue']]) {
    const labels = Object.keys(result[dimension]._breakdownBalances).sort();
    assert.deepEqual(labels, Object.keys((adapter.breakdownMethodology as any)[metric]).sort());
  }
});

test('holder history before deployment stays unknown, including the exclusive end boundary', async () => {
  for (const end of [deploymentTime - 3600, deploymentTime]) {
    const { result, calls } = await run({ end });
    assert.equal(result.dailyHoldersRevenue, undefined);
    assert(!calls.some(c => c.eventAbi.startsWith('event Executed')));
  }
});

test('current periods with receipts but no executed buybacks report zero holder income', async () => {
  const { result } = await run({ credits: [{ recipient: manager, depositor: hook, amount: '1000000000000000000' }] });
  assert.equal(amount(result.dailyHoldersRevenue), 0n);
  assert.equal(amount(result.dailyProtocolRevenue), 1000000000000000000n);
});

test('failed execution reads fail the period rather than recording zero buybacks', async () => {
  await assert.rejects(run({ fail: true }), /RPC unavailable/);
});
