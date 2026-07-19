import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { METRIC } from "../helpers/metrics";

// Quiver Protocol: AI-managed concentrated-liquidity vaults on Robinhood Chain
// (Uniswap V3 + V4, incl. tokenized-stock pairs). Each vault's strategy emits
// Harvest(caller, fees0, fees1, ppsAfter) with the GROSS LP fees collected;
// a performance fee (FeeConfig.getFees) is split at harvest time: callerBps
// of it goes to whoever calls harvest (a keeper incentive), the remainder
// (totalBps - callerBps) goes to the protocol treasury, the rest compounds
// back into the LP position. See QuiverStrategyUniV3._harvest on-chain:
// treasuryBps = totalBps - callerBps; only treasuryBps is sent to treasury.
const FACTORY_V3 = '0xa511D763a79293b306BeAfd3e7eEB5e2884A71d5';
const FACTORY_V4 = '0x3941116A9fF2d3e0B4CFa396d7927e8462dF7b38';
const FEE_CONFIG = '0x777bBe1F53ae75f478DaF22b0E5A5d9513e98E31';

const HARVEST_ABI = 'event Harvest(address indexed caller, uint256 fees0, uint256 fees1, uint256 ppsAfter)';

const abis = {
  allVaults: 'function allVaults(uint256) view returns (address)',
  vaultCount: 'uint256:vaultCount',
  getFees: 'function getFees(address vault) view returns (uint256 totalBps, uint256 callerBps, address treasury)',
};

const fetch = async (options: FetchOptions) => {
  const { api } = options;
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  const dailySupplySideRevenue = options.createBalances();

  const vaults = (await Promise.all([FACTORY_V3, FACTORY_V4].map((target) =>
    api.fetchList({ lengthAbi: abis.vaultCount, itemAbi: abis.allVaults, target })
  ))).flat();
  const strategies = await api.multiCall({ abi: 'address:strategy', calls: vaults });
  const token0s = await api.multiCall({ abi: 'address:token0', calls: strategies });
  const token1s = await api.multiCall({ abi: 'address:token1', calls: strategies });
  const feeSplits = await api.multiCall({ abi: abis.getFees, target: FEE_CONFIG, calls: vaults });

  const logsPerStrategy = await options.getLogs({ targets: strategies, eventAbi: HARVEST_ABI, flatten: false });
  logsPerStrategy.forEach((logs: any[], i: number) => {
    const totalBps = Number(feeSplits[i].totalBps);
    const callerBps = Number(feeSplits[i].callerBps);
    const treasuryBps = totalBps - callerBps;
    logs.forEach((log: any) => {
      dailyFees.add(token0s[i], log.fees0, 'LP fees harvested');
      dailyFees.add(token1s[i], log.fees1, 'LP fees harvested');
      dailyRevenue.add(token0s[i], (BigInt(log.fees0) * BigInt(treasuryBps)) / 10000n, METRIC.PERFORMANCE_FEES);
      dailyRevenue.add(token1s[i], (BigInt(log.fees1) * BigInt(treasuryBps)) / 10000n, METRIC.PERFORMANCE_FEES);
      dailySupplySideRevenue.add(token0s[i], (BigInt(log.fees0) * BigInt(10000 - totalBps)) / 10000n, 'Compounded to LPs');
      dailySupplySideRevenue.add(token1s[i], (BigInt(log.fees1) * BigInt(10000 - totalBps)) / 10000n, 'Compounded to LPs');
    });
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: 'Gross Uniswap V3/V4 LP fees collected by Quiver vault strategies, taken from Harvest events (fees realize when harvested or rebalanced; small fee amounts settled inline during V4 withdrawals are not tracked).',
  Revenue: 'Treasury share of harvested LP fees (totalBps minus the caller incentive callerBps, read live from FeeConfig), sent to the protocol treasury. Excludes the caller fee, which is paid to whoever calls harvest, not the protocol.',
  ProtocolRevenue: 'Treasury share of harvested LP fees (totalBps minus the caller incentive callerBps, read live from FeeConfig), sent to the protocol treasury. Excludes the caller fee, which is paid to whoever calls harvest, not the protocol.',
  SupplySideRevenue: 'The remaining share of harvested LP fees after the full performance fee (totalBps) is taken, compounded back into vault positions for depositors.',
};

const breakdownMethodology = {
  Fees: {
    "LP fees harvested": "Gross Uniswap V3/V4 LP fees collected by Quiver vault strategies, taken from Harvest events (fees realize when harvested or rebalanced; small fee amounts settled inline during V4 withdrawals are not tracked).",
  },
  Revenue: {
    [METRIC.PERFORMANCE_FEES]: "Treasury share of harvested LP fees (totalBps minus the caller incentive callerBps, read live from FeeConfig), sent to the protocol treasury.",
  },
  ProtocolRevenue: {
    [METRIC.PERFORMANCE_FEES]: "Treasury share of harvested LP fees (totalBps minus the caller incentive callerBps, read live from FeeConfig), sent to the protocol treasury.",
  },
  SupplySideRevenue: {
    "Compounded to LPs": "The remaining share of harvested LP fees after the full performance fee is taken, compounded back into vault positions for depositors.",
  },
}

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  methodology,
  breakdownMethodology,
  chains: [CHAIN.ROBINHOOD],
  start: '2026-07-16',
  doublecounted: true, // uniswap
};

export default adapter;
