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
  const totalVolume = Object.values(historicalVolume).reduce(
    (acc, volume) => acc + volume,
    0
  );
  const dailyVolume = Object.entries(historicalVolume).find(
    ([date]) => new Date(date).getTime() / 1000 === dayTimestamp
  )?.[1];
  return {
    timestamp: dayTimestamp,
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
  };
};

const adapter: Adapter = {
  adapter: {
    [CHAIN.STARKNET]: {
      fetch: fetch,
      // runAtCurrTime: true,
      start: async () => 1700956800,
    },
  },
};

export default adapter;
