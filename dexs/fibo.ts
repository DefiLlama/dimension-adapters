import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import fetchURL from "../utils/fetchURL";
import coreAssets from "../helpers/coreAssets.json"

const FIBO_API_URL = "https://api.fibo.fun/api/pulse";
type FiboDailyMetrics = {
  start: number;
  end: number;
  dailyVolumeUsdc: string;
};

const fetch = async (options: FetchOptions) => {
  const url = `${FIBO_API_URL}/defillama/daily?start=${options.startTimestamp}&end=${options.endTimestamp}`;
  const data: FiboDailyMetrics = await fetchURL(url);
  const dailyVolume = options.createBalances();
  dailyVolume.add(coreAssets.base.USDC, data.dailyVolumeUsdc);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 1,
  methodology: {
    Volume:
      "Total USDC wagered on FIBO parimutuel Up/Down rounds in the period. TVL is not applicable (2-minute rounds).",
  },
  adapter: {
    [CHAIN.BASE]: {
      fetch,
      start: "2026-06-16",
    },
  },
};

export default adapter;
