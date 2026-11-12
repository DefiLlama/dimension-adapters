import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import fetchURL from '../../utils/fetchURL';
import { dailyResponse } from './accounting';
import { managedVaults } from './deployments';
import { vaultFees } from './vaults';

const SWAP_FEES = 'Vault Liquidity Fees';
const OPERATIONS = 'Vault Fees To Operations';
const BUYBACK_RESERVE = 'Vault Fees To Buyback Reserve';
const DEPOSITORS = 'Vault Fees To Depositors';
// Gauge rewards (UP on Up, RAM on Ramses, FABLES on Fables) earned by the vaults that replaced V7, which charge the same
// fee shares on them
const REWARDS = 'Vault Gauge Rewards';
const REWARDS_OPERATIONS = 'Vault Gauge Rewards To Operations';
const REWARDS_BUYBACK_RESERVE = 'Vault Gauge Rewards To Buyback Reserve';
const REWARDS_DEPOSITORS = 'Vault Gauge Rewards To Depositors';

/** Convert validated daily native-token earnings into fee and revenue balances. */
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
  const dailyProtocolRevenue = options.createBalances();
  const dailyHoldersRevenue = options.createBalances();
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
      dailyProtocolRevenue.add(token, operations, OPERATIONS);
      // Booked when fees accrue into the buyback reserve, not when SPRING is bought or burned.
      dailyHoldersRevenue.add(token, buyback, BUYBACK_RESERVE);
      dailySupplySideRevenue.add(token, earned - operations - buyback, DEPOSITORS);
    }
  });
  // Vaults that replaced V7, read on-chain: each vault's protocolFeeBps (10%) and buybackFeeBps (20%), on trading fees
  // and gauge rewards alike
  for (const { source, token, earned, operations, buyback } of await vaultFees(options)) {
    const [fees, toOperations, toBuyback, toDepositors] = source === 'rewards'
      ? [REWARDS, REWARDS_OPERATIONS, REWARDS_BUYBACK_RESERVE, REWARDS_DEPOSITORS]
      : [SWAP_FEES, OPERATIONS, BUYBACK_RESERVE, DEPOSITORS];
    dailyFees.add(token, earned, fees);
    dailyRevenue.add(token, operations, toOperations);
    dailyRevenue.add(token, buyback, toBuyback);
    dailyProtocolRevenue.add(token, operations, toOperations);
    dailyHoldersRevenue.add(token, buyback, toBuyback);
    dailySupplySideRevenue.add(token, earned - operations - buyback, toDepositors);
  }
  return { dailyFees, dailyRevenue, dailyProtocolRevenue, dailyHoldersRevenue, dailySupplySideRevenue };
};
const protocolBreakdown = {
  [OPERATIONS]: 'The operations allocation of earned vault LP fees (10%).',
  [REWARDS_OPERATIONS]: 'The operations allocation of earned vault gauge rewards (10%).',
};
const holdersBreakdown = {
  [BUYBACK_RESERVE]: 'The allocation reserved for future SPRING buybacks and burns (20%), measured when fees accrue rather than when the buyback executes.',
  [REWARDS_BUYBACK_RESERVE]: 'The allocation of earned vault gauge rewards reserved for future SPRING buybacks and burns (20%), measured when the rewards accrue rather than when the buyback executes.',
};
const revenueBreakdown = { ...protocolBreakdown, ...holdersBreakdown };
const adapter: SimpleAdapter = {
  version: 1, // The API only exposes completed UTC days; no hourly aggregation.
  doublecounted: true, // LP fees overlap the underlying Uniswap adapters.
  chains: [CHAIN.ROBINHOOD], start: '2026-09-11', fetch,
  // Net fees may decrease by at most one raw unit per vault/token/day; larger drops throw.
  // Cumulative allocation floors may also produce raw-unit revenue/supplier negatives.
  allowNegativeValue: true,
  methodology: {
    Fees: 'LP fees and gauge rewards earned by the TickerSpring vaults during the UTC day, including amounts not yet collected. V7 vaults: the change in cumulative harvested plus pending native-token fees from saved on-chain observations. Vaults that replaced V7 (listed by https://api.tickerspring.com/v1/merged/vaults): the trading fees and gauge rewards (UP on Up, RAM on Ramses, FABLES on Fables) their Harvest events collected plus the change in uncollected position fees and unclaimed rewards, read on-chain at the day\'s first and last blocks. Excludes principal, stock-price returns, retired vaults and lending.',
    Revenue: 'Earned vault LP fees and gauge rewards allocated to operations (10%) and the SPRING buyback reserve (20%), subject to raw-token rounding.',
    ProtocolRevenue: 'The operations allocation (10%) of earned vault LP fees and gauge rewards.',
    HoldersRevenue: 'The allocation of earned vault LP fees and gauge rewards reserved to buy and permanently burn SPRING (20%), measured when they accrue rather than when the buyback executes.',
    SupplySideRevenue: 'Earned LP fees and gauge rewards retained for vault depositors after protocol allocations (approximately 70%).',
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: 'V7 vaults: daily change in grossFees plus position.pendingFees, in each underlying token, from the public daily history API; missing observations fail instead of returning zero. Vaults that replaced V7: USDG and pool-token fees from Harvest events plus the change in the venue position\'s uncollected fees (fee growth inside its range on Uniswap V3, Up and Ramses; the PoolManager position on Uniswap V4). Fables venues stake all their liquidity, so they earn FABLES instead of trading fees. Harvesting moves fees between these counters without counting them twice.',
      [REWARDS]: 'Gauge rewards earned by the positions of the vaults that replaced V7: UP on Up (a staked position earns UP instead of trading fees), RAM on Ramses and FABLES on Fables (the venue stakes all its liquidity in the Fables hook, whose staked shares give their trading fees to Fables voters and earn FABLES). The rewards their Harvest events claimed plus the change in rewards not yet claimed (the Up gauge\'s earned() for the staked position; the Ramses venue\'s pendingRewards(); the FABLES the Fables venue holds, counted once claimed to it from the Fables emission stream). The vaults charge the same fee shares on rewards as on trading fees; V7 and Uniswap vaults earn none.',
    },
    Revenue: revenueBreakdown, ProtocolRevenue: protocolBreakdown, HoldersRevenue: holdersBreakdown,
    SupplySideRevenue: {
      [DEPOSITORS]: 'Earned vault LP fees minus the accrued operations and buyback-reserve allocations.',
      [REWARDS_DEPOSITORS]: 'Earned vault gauge rewards minus the accrued operations and buyback-reserve allocations.',
    },
  },
};
export default adapter;
