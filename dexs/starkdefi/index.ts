import { Adapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type TVolume = Record<string, number>;

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
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
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetch,
      // runAtCurrTime: true,
      start: '2023-11-26',
    },
  },
};

export default adapter;
