import { Dependencies, FetchOptions } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getSqlFromFile, queryDuneResult, queryDuneSql } from '../helpers/dune';

const MARKETS: Record<string, { cgId: string }> = {
  'So11111111111111111111111111111111111111112': { cgId: 'solana' },
  '3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh': { cgId: 'bitcoin' },
  '7vfCXTUXx5WJV5JADk17DUJ4ksgau7utNKj4b963voxs': { cgId: 'ethereum' },
};

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const queryId = '6948793';
  let data: any[] = []

  if (options.startOfDay >= 1775260800) {
    data = await queryDuneSql(options, getSqlFromFile('helpers/queries/jupiter-perpetual-oi.sql'));
  }
  else {
    data = await queryDuneResult(options, queryId);
  }

  const targetDate = options.dateString;
  const filtered = data.filter(
    (row: any) => typeof row.day === 'string' && row.day.slice(0, 10) === targetDate,
  );
  if (!filtered.length) {
    throw new Error(`No OI data found for date ${targetDate}`);
  }

  const longOpenInterestAtEnd = options.createBalances();
  const shortOpenInterestAtEnd = options.createBalances();

  for (const row of filtered) {
    const market = MARKETS[row.position_mint];
    if (!market) continue;
    const nativeOi = Math.abs(row.cumulative_native_oi);
    if (row.position_side === 1) {
      longOpenInterestAtEnd.addCGToken(market.cgId, nativeOi);
    } else {
      shortOpenInterestAtEnd.addCGToken(market.cgId, nativeOi);
    }
  }

  const openInterestAtEnd = longOpenInterestAtEnd.clone();
  openInterestAtEnd.add(shortOpenInterestAtEnd);

  return {
    longOpenInterestAtEnd,
    shortOpenInterestAtEnd,
    openInterestAtEnd,
  };
};

const adapter = {
  version: 1,
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2023-07-18',
  dependencies: [Dependencies.DUNE],
};

export default adapter;
