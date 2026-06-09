import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { httpGet } from "../utils/fetchURL";

const STATS_URL = "https://api.archer.exchange/v1/stats/dimensions";

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const { volumeUsd } = await httpGet(
    `${STATS_URL}?start=${options.startTimestamp}&end=${options.endTimestamp}`
  );

  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(Number(volumeUsd));
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SOLANA]: {
      fetch,
      start: "2026-02-23",
    },
  },
};

export default adapter;
