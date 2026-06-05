import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type TVolume = Record<string, number>;

const fetch = async (options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.toTimestamp * 1000));
  const historicalVolume: TVolume = (
    await fetchURL("https://api.starkdefi.com/v1/analytics/daily-volume")
  );
  const dailyVolume = Object.entries(historicalVolume).find(
    ([date]) => new Date(date).getTime() / 1000 === dayTimestamp
  )?.[1];
  return {
    timestamp: dayTimestamp,
    dailyVolume: dailyVolume,
  };
};

const adapter: Adapter = {
  fetch,
  chains: [CHAIN.STARKNET],
  start: '2023-11-26',
  // runAtCurrTime: true,
} 

export default adapter;
