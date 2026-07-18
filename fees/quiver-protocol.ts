import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

// Quiver Protocol: AI-managed concentrated-liquidity vaults on Robinhood Chain
// (Uniswap V3 + V4, incl. tokenized-stock pairs). Each vault's strategy emits
// Harvest(caller, fees0, fees1, ppsAfter) with the GROSS LP fees collected;
// a 10% performance fee (FeeConfig.getFees) goes to the treasury and the rest
// compounds back into the LP position.
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
  const [token0s, token1s, feeSplits] = await Promise.all([
    api.multiCall({ abi: 'address:token0', calls: strategies }),
    api.multiCall({ abi: 'address:token1', calls: strategies }),
    api.multiCall({ abi: abis.getFees, target: FEE_CONFIG, calls: vaults }),
  ]);

  const logsPerStrategy = await options.getLogs({ targets: strategies, eventAbi: HARVEST_ABI, flatten: false });
  logsPerStrategy.forEach((logs: any[], i: number) => {
    const perfBps = Number(feeSplits[i].totalBps);
    logs.forEach((log: any) => {
      dailyFees.add(token0s[i], log.fees0, 'LP fees harvested');
      dailyFees.add(token1s[i], log.fees1, 'LP fees harvested');
      dailyRevenue.add(token0s[i], (BigInt(log.fees0) * BigInt(perfBps)) / 10000n, 'Performance fee');
      dailyRevenue.add(token1s[i], (BigInt(log.fees1) * BigInt(perfBps)) / 10000n, 'Performance fee');
      dailySupplySideRevenue.add(token0s[i], (BigInt(log.fees0) * BigInt(10000 - perfBps)) / 10000n, 'Compounded to LPs');
      dailySupplySideRevenue.add(token1s[i], (BigInt(log.fees1) * BigInt(10000 - perfBps)) / 10000n, 'Compounded to LPs');
    });
  });

  return { dailyFees, dailyRevenue, dailyProtocolRevenue: dailyRevenue, dailySupplySideRevenue };
};

const methodology = {
  Fees: 'Gross Uniswap V3/V4 LP fees collected by Quiver vault strategies, taken from Harvest events (fees realize when harvested or rebalanced; small fee amounts settled inline during V4 withdrawals are not tracked).',
  Revenue: 'Performance fee share of harvested LP fees (currently 10%, read live from FeeConfig), sent to the protocol treasury.',
  ProtocolRevenue: 'All revenue goes to the protocol treasury; Quiver has no token.',
  SupplySideRevenue: 'The remaining ~90% of harvested LP fees, compounded back into vault positions for depositors.',
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  methodology,
  adapter: {
    [CHAIN.ROBINHOOD]: {
      start: '2026-07-16',
    },
  },
};

export default adapter;
