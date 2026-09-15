import assert from 'node:assert/strict';
import test from 'node:test';
import { Balances } from '@defillama/sdk';
import { FetchOptions } from '../adapters/types';
import adapter from '../aggregators/arbitrage-inc';

const DEX_FEE_RECEIVER = '0xafF5340ECFaf7ce049261cff193f5FED6BDF04E7';
const TAX_ACCUMULATOR = '0x4c1caA917FD012b285Ba35E93535675e5B59806C';
const ARB_TOKEN = '0x5EE54869Ecd5E752C31aF095187326D4A4D50e1c';
const usdt = 'bsc:0x55d398326f99059ff775485246999027b3197955';
const arbKey = `bsc:${ARB_TOKEN.toLowerCase()}`;

// Commit 9a41ee3: Mon Jun 8 00:00:00 UTC 2026
const FEE_RATE_CHANGE_TIMESTAMP = 1780876800;

async function run({
  swapLogs = [] as any[],
  taxLogs = [] as any[],
  timestamp = FEE_RATE_CHANGE_TIMESTAMP + 86400,
} = {}) {
  const options = {
    chain: 'bsc',
    toTimestamp: timestamp,
    startTimestamp: timestamp - 3600,
    endTimestamp: timestamp,
    startOfDay: Math.floor(timestamp / 86400) * 86400,
    createBalances: () => new Balances({ chain: 'bsc', timestamp }),
    getFromBlock: async () => 1000000,
    getToBlock: async () => 1001200,
    getLogs: async (query: any) => {
      // Return swapLogs when querying for DEX fee receiver, taxLogs when querying for tax accumulator
      if (query.topics && query.topics[2] && query.topics[2].toLowerCase().includes(DEX_FEE_RECEIVER.slice(2).toLowerCase())) {
        return swapLogs;
      }
      if (query.topics && query.topics[2] && query.topics[2].toLowerCase().includes(TAX_ACCUMULATOR.slice(2).toLowerCase())) {
        return taxLogs;
      }
      return [];
    },
  } as unknown as FetchOptions;

  const result = await (adapter.fetch as (options: FetchOptions) => Promise<any>)(options);
  return { result };
}

test('fee rate switches from 0.1% to 0.5% after June 8, 2026 timestamp', async () => {
  // Before fee change: 100 USDT in swap dev fees should equal 100,000 USDT in volume (1000x multiplier)
  const swapLogsBefore = [
    {
      address: '0x55d398326f99059ff775485246999027b3197955',
      data: '0x' + (100n * 10n ** 18n).toString(16),
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, '0x000000000000000000000000' + DEX_FEE_RECEIVER.slice(2)],
      from: '0x1111111111111111111111111111111111111111',
    },
  ];

  const { result: resBefore } = await run({
    swapLogs: swapLogsBefore,
    timestamp: FEE_RATE_CHANGE_TIMESTAMP - 3600,
  });

  const volBefore = Number(resBefore.dailyVolume.getBalances()[usdt] ?? 0);
  assert(Math.abs(volBefore - 100000e18) < 1e12, 'Volume before should be 100,000 USDT');

  // After fee change: 100 USDT in swap dev fees should equal 20,000 USDT in volume (200x multiplier)
  const { result: resAfter } = await run({
    swapLogs: swapLogsBefore,
    timestamp: FEE_RATE_CHANGE_TIMESTAMP + 86400,
  });

  const volAfter = Number(resAfter.dailyVolume.getBalances()[usdt] ?? 0);
  assert(Math.abs(volAfter - 20000e18) < 1e12, 'Volume after should be 20,000 USDT');
});

test('internal transfers from tax accumulator to fee receiver are excluded to avoid double counting', async () => {
  // Transfer from accumulator to fee receiver should be filtered out by logFilter
  const filteredLogs = [
    {
      address: ARB_TOKEN,
      data: '0x' + (500n * 10n ** 18n).toString(16),
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, '0x000000000000000000000000' + DEX_FEE_RECEIVER.slice(2)],
      from: TAX_ACCUMULATOR,
    },
    {
      address: '0x55d398326f99059ff775485246999027b3197955',
      data: '0x' + (50n * 10n ** 18n).toString(16),
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, '0x000000000000000000000000' + DEX_FEE_RECEIVER.slice(2)],
      from: '0x2222222222222222222222222222222222222222',
    },
  ];

  const { result } = await run({ swapLogs: filteredLogs });
  // ARB token from accumulator should NOT appear in swap volume or fees
  assert.equal(result.dailyVolume.getBalances()[arbKey], undefined);
  // Only the external swap dev fee is counted (50 USDT * 200 = 10,000 USDT)
  const vol = Number(result.dailyVolume.getBalances()[usdt] ?? 0);
  assert(Math.abs(vol - 10000e18) < 1e12, 'Volume should be 10,000 USDT');
});

test('RevShare 40/60 split and GAAP accounting identities hold strictly', async () => {
  const swapLogs = [
    {
      address: '0x55d398326f99059ff775485246999027b3197955',
      data: '0x' + (10n * 10n ** 18n).toString(16), // 10 USDT swap fee
      topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, '0x000000000000000000000000' + DEX_FEE_RECEIVER.slice(2)],
      from: '0x3333333333333333333333333333333333333333',
    },
  ];
  const taxLogs = [
    [
      {
        address: ARB_TOKEN,
        value: (1000n * 10n ** 18n).toString(), // 1000 ARB tax collected
        topics: ['0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef', null, '0x000000000000000000000000' + TAX_ACCUMULATOR.slice(2)],
      },
    ],
  ];

  const { result } = await run({ swapLogs, taxLogs });

  // 1. dailyHoldersRevenue = 40% of Token Tax = 400 ARB
  const holdersArb = Number(result.dailyHoldersRevenue.getBalances()[arbKey] ?? 0);
  assert(Math.abs(holdersArb - 400e18) < 1e12, 'Holders revenue should be 400 ARB');

  // 2. dailyProtocolRevenue = 60% of Token Tax (600 ARB) + 100% of Swap Fees (10 USDT)
  const protocolArb = Number(result.dailyProtocolRevenue.getBalances()[arbKey] ?? 0);
  const protocolUsdt = Number(result.dailyProtocolRevenue.getBalances()[usdt] ?? 0);
  assert(Math.abs(protocolArb - 600e18) < 1e12, 'Protocol ARB should be 600 ARB');
  assert(Math.abs(protocolUsdt - 10e18) < 1e12, 'Protocol USDT should be 10 USDT');

  // 3. dailyFees = 1000 ARB + 10 USDT
  const feesArb = Number(result.dailyFees.getBalances()[arbKey] ?? 0);
  const feesUsdt = Number(result.dailyFees.getBalances()[usdt] ?? 0);
  assert(Math.abs(feesArb - 1000e18) < 1e12, 'Fees ARB should be 1000 ARB');
  assert(Math.abs(feesUsdt - 10e18) < 1e12, 'Fees USDT should be 10 USDT');

  // 4. GAAP Identity: dailyRevenue = dailyProtocolRevenue + dailyHoldersRevenue
  assert(Math.abs(protocolArb + holdersArb - feesArb) < 1e12, 'GAAP: protocol + holders ARB == fees ARB');
  assert(Math.abs(protocolUsdt - feesUsdt) < 1e12, 'GAAP: protocol USDT == fees USDT');

  // 5. Breakdown labels match breakdownMethodology
  for (const [metric, dimension] of [
    ['Fees', 'dailyFees'],
    ['Revenue', 'dailyRevenue'],
    ['ProtocolRevenue', 'dailyProtocolRevenue'],
    ['HoldersRevenue', 'dailyHoldersRevenue'],
  ]) {
    const breakdownKeys = Object.keys(result[dimension]._breakdownBalances).sort();
    const methodologyKeys = Object.keys((adapter.breakdownMethodology as any)[metric]).sort();
    assert.deepEqual(breakdownKeys, methodologyKeys);
  }
});
