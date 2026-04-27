import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUnidexV4Logs, toUSD } from "../helpers/unidex-v4";

const fetch = async (options: FetchOptions) => {
  const [increaseLogs, decreaseLogs, closeLogs, liquidateLogs] = await getUnidexV4Logs(options);

  let volumeRaw = BigInt(0);

  for (const log of [...increaseLogs, ...decreaseLogs, ...closeLogs, ...liquidateLogs])
    volumeRaw += BigInt(log.posData[1]);

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(toUSD(volumeRaw));

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.ARBITRUM],
  start: '2024-09-20',
};

export default adapter;
