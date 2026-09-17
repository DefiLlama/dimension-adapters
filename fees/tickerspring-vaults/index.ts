import { ChainApi } from '@defillama/sdk';
import { FetchOptions, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';
import { managedVaults } from './deployments';

const SWAP_FEES = 'Vault Liquidity Fees';
const OPERATIONS = 'Vault Fees To Operations';
const BUYBACK_RESERVE = 'Vault Fees To Buyback Reserve';
const DEPOSITORS = 'Vault Fees To Depositors';

// Archive reads are required. Share-price changes include stock exposure and are NOT fees.
// grossFees + position.pendingFees follows only LP fees, across harvests and migrations.
async function snapshot(api: ChainApi, block: number) {
  const vaults = managedVaults.filter(v => v.deploymentBlock <= block);
  const result = new Map<string, { token: string; gross: bigint }>();
  if (!vaults.length) return result;
  const calls = vaults.map(v => ({ target: v.vault }));
  const positions = await api.multiCall({ abi: 'address:position', calls });
  const tokens0 = await api.multiCall({ abi: 'address:token0', calls });
  const tokens1 = await api.multiCall({ abi: 'address:token1', calls });
  const gross = await api.multiCall({
    abi: 'function grossFees(uint256) view returns (uint256)',
    calls: vaults.flatMap(v => [0, 1].map(side => ({ target: v.vault, params: [side] }))),
  });
  // A newly deployed vault may not yet have its position bound. It cannot earn LP fees then.
  const active = positions.map((position, index) => ({ position, index }))
    .filter(p => p.position.toLowerCase() !== '0x0000000000000000000000000000000000000000');
  const pending = await api.multiCall({
    abi: 'function pendingFees() view returns (uint256, uint256)',
    calls: active.map(p => ({ target: p.position })),
  });
  const pendingByIndex = new Map(active.map((p, i) => [p.index, pending[i]]));
  vaults.forEach((vault, i) => {
    [tokens0[i], tokens1[i]].forEach((token, side) => {
      result.set(`${vault.vault}:${side}`, {
        token, gross: BigInt(gross[i * 2 + side]) + BigInt(pendingByIndex.get(i)?.[side] ?? 0),
      });
    });
  });
  return result;
}

const fetch = async (options: FetchOptions) => {
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();
  const fromBlock = await options.getFromBlock();
  const toBlock = await options.getToBlock();
  const before = await snapshot(options.fromApi, fromBlock);
  const after = await snapshot(options.toApi, toBlock);

  for (const [key, current] of after) {
    const previous = before.get(key);
    if (previous && previous.token.toLowerCase() !== current.token.toLowerCase())
      throw new Error(`TickerSpring vault token changed: ${key}`);
    const earned = current.gross - (previous?.gross ?? 0n);
    // The immutable managed-vault split is 10% operations, 20% buyback reserve, 70% LPs.
    // https://tickerspring.com/docs
    // Use cumulative floors so arbitrary adjacent windows telescope, including sub-unit dust.
    // Contracts floor each harvest separately; this accrual allocation can differ by raw-token dust.
    const operations = current.gross / 10n - (previous?.gross ?? 0n) / 10n;
    const buyback = current.gross / 5n - (previous?.gross ?? 0n) / 5n;
    dailyFees.add(current.token, earned, SWAP_FEES);
    dailyRevenue.add(current.token, operations, OPERATIONS);
    dailyRevenue.add(current.token, buyback, BUYBACK_RESERVE);
    dailySupplySideRevenue.add(current.token, earned - operations - buyback, DEPOSITORS);
  }

  // Buyback reserves are still protocol-controlled funds. Funding is not proof of a buyback,
  // and burns of the pre-existing SPRING treasury allocation are not fee-funded holder income.
  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const revenueBreakdown = {
  [OPERATIONS]: 'The operations share of vault LP fees (10%).',
  [BUYBACK_RESERVE]: 'The share reserved for future SPRING buybacks (20%), not completed buybacks.',
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  doublecounted: true, // Gross LP fees are also included by the underlying Uniswap adapters.
  chains: [CHAIN.ROBINHOOD],
  start: '2026-09-11', // First current V7 vault: deployment block 60517277.
  // Reversals of pending LP fees during recovery and raw-token rounding can produce negatives.
  allowNegativeValue: true,
  fetch,
  methodology: {
    Fees: 'LP fees earned by the 18 current TickerSpring V7 vaults, measured as harvested plus pending fees, excluding retired deployments, deposits, withdrawals and stock-price returns.',
    Revenue: 'Vault fees allocated to operations and the SPRING buyback reserve, normally 30% of earned LP fees.',
    ProtocolRevenue: 'Operations and unspent buyback allocations retained by the protocol; reserve funding and treasury-token burns are not counted as completed buybacks.',
    SupplySideRevenue: 'LP fees retained for vault depositors, normally 70% of earned LP fees.',
  },
  breakdownMethodology: {
    Fees: {
      [SWAP_FEES]: 'Change in cumulative harvested plus pending LP fees in each underlying token of the managed vaults.',
    },
    Revenue: revenueBreakdown,
    ProtocolRevenue: revenueBreakdown,
    SupplySideRevenue: { [DEPOSITORS]: 'Earned vault LP fees remaining after operations and buyback-reserve allocations.' },
  },
};
export default adapter;
