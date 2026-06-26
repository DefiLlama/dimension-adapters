import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";

// Program ID: Archer8kgiavM61GyusMzaaS2ft5sALtNsD1HxkUPMhy
const STATS_URL = "https://api.archer.exchange/v1/stats/dimensions";

const fetch = async (options: FetchOptions) => {
  const { volumeUsd } = await fetchURL(
    `${STATS_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}`
  );

  const volume = Number(volumeUsd);
  if (!Number.isFinite(volume)) {
    throw new Error(`archer-exchange: invalid volumeUsd from stats endpoint: ${volumeUsd}`);
  }

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(volume);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-02-23",
    },
  },
};

export default adapter;
