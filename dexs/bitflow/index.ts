import fetchURL from "../../utils/fetchURL";
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://app.bitflow.finance/api/totalVolume";

interface Timestamp {
  _seconds: number;
  _nanoseconds: number;
}

interface HistoricalTotalVolume {
  date: Timestamp;
  tvl: number;
}

const getHistoricalTVL = async (): Promise<HistoricalTotalVolume[]> => {
  return (await fetchURL(historicalVolumeEndpoint)).data.data;
};

const getDateFromTimestamp = (timestamp: Timestamp) => {
  return new Date(timestamp._seconds * 1000);
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const historicalVolume: HistoricalTotalVolume[] = await getHistoricalTVL();

  const totalVolume = historicalVolume
    .filter(
      (volItem) =>
        getDateFromTimestamp(volItem.date).getTime() / 1000 <= dayTimestamp
    )
    .reduce((acc, { tvl }) => acc + tvl, 0);

  const dailyVolume = historicalVolume.find(
    (dayItem) =>
      getDateFromTimestamp(dayItem.date).getTime() / 1000 === dayTimestamp
  )?.tvl;

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: HistoricalTotalVolume[] = await getHistoricalTVL();
  return getDateFromTimestamp(historicalVolume[0].date).getTime() / 1000;
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STACKS]: {
      fetch,
      start: getStartTimestamp,
      customBackfill: customBackfill(
        CHAIN.STACKS as Chain,
        (_chain: string) => fetch
      ),
    },
  },
};

export default adapter;
