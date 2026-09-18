import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';
import { dailyResponse } from './accounting';
import { managedVaults } from './deployments';

const SWAP_FEES = 'Vault Liquidity Fees';
const OPERATIONS = 'Vault Fees To Operations';
const BUYBACK_RESERVE = 'Vault Fees To Buyback Reserve';
const DEPOSITORS = 'Vault Fees To Depositors';

const fetch = async (options: FetchOptions) => {
  // Daily-only API: saved on-chain counters at exact UTC boundaries, including pending fees.
  // The service captures recent state with public RPC and durably stores it for historical queries.
  // At each boundary block, read vault.position(), vault.grossFees(0) and vault.grossFees(1).
  // Read pendingFees(), token0() and token1() on that position; verify tokens against deployments.ts.
  const data = await fetchURL(`https://api.tickerspring.com/v1/public/fees/tickerspring-vaults?date=${options.dateString}`);
  if (data.version !== 1 || data.chain !== CHAIN.ROBINHOOD || data.date !== options.dateString)
    throw new Error('TickerSpring: unexpected fee response');
  const { opening, closing } = dailyResponse(options.dateString, data.opening, data.closing);
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  managedVaults.forEach((vault, i) => {
    for (const side of [0, 1] as const) {
      const before = BigInt(opening.vaults[i].harvested[side]) + BigInt(opening.vaults[i].pending[side]);
      const after = BigInt(closing.vaults[i].harvested[side]) + BigInt(closing.vaults[i].pending[side]);
      const earned = after - before;
      // Immutable V7 split: https://tickerspring.com/docs
      // Cumulative floors preserve adjacent-day totals. Per-harvest contract rounding can differ by dust.
      const operations = after / 10n - before / 10n, buyback = after / 5n - before / 5n;
      const token = side === 0 ? vault.token0 : vault.token1;
      dailyFees.add(token, earned, SWAP_FEES);
      dailyRevenue.add(token, operations, OPERATIONS);
      dailyRevenue.add(token, buyback, BUYBACK_RESERVE);
      dailySupplySideRevenue.add(token, earned - operations - buyback, DEPOSITORS);
    }
  });
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};
const revenueBreakdown = {
  [OPERATIONS]: 'The operations allocation of earned vault LP fees (10%).',
  [BUYBACK_RESERVE]: 'The allocation reserved for future SPRING buybacks (20%), not completed buybacks.',
};
const adapter: SimpleAdapter = {
  version: 1, // The API only exposes completed UTC days; no hourly aggregation.
  doublecounted: true, // LP fees overlap the underlying Uniswap adapters.
  chains: [CHAIN.ROBINHOOD], start: '2026-09-11', fetch,
  // Pending-fee/allocation rounding may produce raw-token dust negatives. Recovery moves pending into grossFees.
  allowNegativeValue: true,
  methodology: {
    Fees: 'LP fees earned by the listed TickerSpring V7 vaults during the UTC day, including uncollected fees. Measured as the change in cumulative harvested plus pending native-token fees from saved on-chain observations. Excludes principal, stock-price returns, retired vaults and lending.',
    Revenue: 'Earned vault LP fees allocated to operations (10%) and the SPRING buyback reserve (20%), subject to raw-token rounding.',
    ProtocolRevenue: 'Operations and buyback-reserve allocations; reserve funding is not a completed buyback.',
    SupplySideRevenue: 'Earned LP fees retained for vault depositors after protocol allocations (approximately 70%).',
  },
  breakdownMethodology: {
    Fees: { [SWAP_FEES]: 'Daily change in grossFees plus position.pendingFees, in each underlying token, from the public daily history API. Harvesting moves fees between these counters without counting them twice. Missing observations fail instead of returning zero.' },
    Revenue: revenueBreakdown, ProtocolRevenue: revenueBreakdown,
    SupplySideRevenue: { [DEPOSITORS]: 'Earned vault LP fees minus the accrued operations and buyback-reserve allocations.' },
  },
};
export default adapter;
