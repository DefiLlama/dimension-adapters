import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUnidexV4Logs, toUSD } from "../helpers/unidex-v4";

const fetch = async (options: FetchOptions) => {
  const [increaseLogs, decreaseLogs, closeLogs, liquidateLogs] = await getUnidexV4Logs(options);

  const dailyVolume = options.createBalances();

  for (const log of [...increaseLogs, ...decreaseLogs, ...closeLogs, ...liquidateLogs]) {
    dailyVolume.addUSDValue(toUSD(log.posData.sizeDelta));
  };

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-09-20',
};

export default adapter;
