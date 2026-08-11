import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const NEW_SPENDER_MODULE_DEPLOYMENT = 1780595045; // Jun-04-2026 05:44:05 PM UTC

const configs: Record<string, { spendModules: string[] }> = {
  [CHAIN.XDAI]: {
    spendModules: [
      '0xcff260bfbc199dc82717494299b1acade25f549b', // old spend module
      '0x5f07734E2B9C4dE6f9C32253d485741800da3F8a', // new spend module
    ],
  }
}

const SpendEvent = 'event Spend (address asset, address account, address receiver, uint256 amount)';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();
  const { spendModules } = configs[options.chain];
  const spendModuleTargets = options.toTimestamp < NEW_SPENDER_MODULE_DEPLOYMENT ? [spendModules[0]]
    : options.fromTimestamp >= NEW_SPENDER_MODULE_DEPLOYMENT ? [spendModules[1]]
    : spendModules;

  const spendLogs = await options.getLogs({
    targets: spendModuleTargets,
    eventAbi: SpendEvent,
  });
  for (const log of spendLogs) {
    dailyVolume.add(log.asset, log.amount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  start: '2023-12-28',
  fetch,
  chains: [CHAIN.XDAI],
};

export default adapter;