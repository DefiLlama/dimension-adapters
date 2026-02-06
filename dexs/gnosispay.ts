import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";

const configs: Record<string, { spendModule: string, start: string }> = {
  [CHAIN.XDAI]: {
    start: '2023-12-28',
    spendModule: '0xcff260bfbc199dc82717494299b1acade25f549b',
  }
}

const SpendEvent = 'event Spend (address asset, address account, address receiver, uint256 amount)';

const fetch = async (options: FetchOptions) => {
  const dailyVolume = options.createBalances();

  const spendLogs = await options.getLogs({
    target: configs[options.chain].spendModule,
    eventAbi: SpendEvent,
  });
  for (const log of spendLogs) {
    dailyVolume.add(log.asset, log.amount);
  }

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.XDAI],
};

export default adapter;