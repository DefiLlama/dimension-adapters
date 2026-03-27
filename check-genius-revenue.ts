/**
 * Genius Protocol — Cumulative Revenue Check (EVM)
 *
 * Usage:
 *   npx ts-node --transpile-only check-genius-revenue.ts
 *
 * Tracks ERC-20 inflows on all EVM chains. When ALLIUM_API_KEY is set,
 * also includes native coin inflows (ETH/BNB/MATIC/etc.).
 *
 * Loops every day from START_DATE to today and prints a per-day + grand total.
 */

import runAdapter from './adapters/utils/runAdapter';
import { Adapter } from './adapters/types';
import { CHAIN } from './helpers/chains';
import { addTokensReceived, getETHReceived } from './helpers/token';
import type { FetchOptions } from './adapters/types';

const EVM_MULTISIG = '0x03D7D9CAf7498f524d17F5e863c12b88F546BaAD';
const START_DATE   = '2026-01-01';
const ONE_DAY      = 86400;
const HAS_ALLIUM   = Boolean(process.env.ALLIUM_API_KEY);

const fetchEVMLocal = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();

  // ERC-20 inflows — always available
  await addTokensReceived({ options, target: EVM_MULTISIG, balances: dailyFees });

  // Native coin inflows — only when Allium key is present
  if (HAS_ALLIUM) {
    try {
      await getETHReceived({ options, balances: dailyFees, target: EVM_MULTISIG });
    } catch (e: any) {
      console.warn(`  [native] ${options.chain}: ${e.message?.slice(0, 60)}`);
    }
  }

  return { dailyFees, dailyRevenue: dailyFees };
};

const EVM_CHAINS = [
  CHAIN.ETHEREUM,
  CHAIN.BSC,
  CHAIN.POLYGON,
  CHAIN.AVAX,
  CHAIN.ARBITRUM,
  CHAIN.OPTIMISM,
  CHAIN.BASE,
  CHAIN.SONIC,
  CHAIN.HYPERLIQUID,
];

const localAdapter: Adapter = {
  version: 2,
  adapter: Object.fromEntries(
    EVM_CHAINS.map((chain) => [chain, { fetch: fetchEVMLocal, start: START_DATE }])
  ),
};

function dayEndTimestamps(start: string): number[] {
  const startTs = Math.floor(new Date(start).getTime() / 1000);
  const nowTs   = Math.floor(Date.now() / 1000);
  const days: number[] = [];
  for (let ts = startTs + ONE_DAY; ts <= nowTs; ts += ONE_DAY) {
    days.push(ts);
  }
  return days;
}

function fmt(n: number): string {
  return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

async function main() {
  const days = dayEndTimestamps(START_DATE);
  const nativeNote = HAS_ALLIUM ? 'ERC-20 + native coin inflows' : 'ERC-20 inflows only (set ALLIUM_API_KEY for native coins)';
  console.log(`\nGenius Protocol cumulative revenue check`);
  console.log(`${days.length} days · ${START_DATE} → today · ${nativeNote}\n`);
  console.log('Date'.padEnd(14) + 'Daily Fees (USD)');
  console.log('─'.repeat(38));

  let grandTotal = 0;
  let failedDays = 0;

  for (const endTs of days) {
    const dateStr = new Date((endTs - ONE_DAY) * 1000).toISOString().slice(0, 10);
    try {
      const result = await runAdapter({
        module: { ...localAdapter },
        endTimestamp: endTs,
        isTest: false,
      });

      let dayTotal = 0;
      for (const chainResult of Object.values(result)) {
        const fees = (chainResult as any)?.dailyFees;
        if (typeof fees === 'number' && fees > 0) dayTotal += fees;
      }

      grandTotal += dayTotal;
      const marker = dayTotal > 0 ? '' : '  (no data)';
      console.log(dateStr.padEnd(14) + fmt(dayTotal) + marker);
    } catch (e: any) {
      failedDays++;
      console.log(dateStr.padEnd(14) + `ERROR: ${String(e.message).slice(0, 50)}`);
    }
  }

  console.log('─'.repeat(38));
  console.log('TOTAL'.padEnd(14) + fmt(grandTotal));
  if (failedDays > 0) {
    console.log(`\n⚠  ${failedDays} day(s) errored and were excluded from the total`);
  }
  console.log('');
}

main().catch(console.error);
