import { FetchOptions, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import {
  fetchFiboDailyMetrics,
  FIBO_USDC,
} from "../helpers/fibo";

const fetch = async (options: FetchOptions) => {
  const data = await fetchFiboDailyMetrics(options);
  const dailyVolume = options.createBalances();
  dailyVolume.add(FIBO_USDC, data.dailyVolumeUsdc);
  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  version: 2,
  pullHourly: true,
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
