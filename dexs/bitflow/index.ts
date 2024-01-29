import fetchURL from "../../utils/fetchURL";
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://app.bitflow.finance/api/totalVolume";

interface HistoricalTotalVolume {
  date: any;
  tvl: number;
}

const getHistoricalTVL = async (): Promise<HistoricalTotalVolume[]> => {
  return (await fetchURL(historicalVolumeEndpoint)).data.data;
};

const getDate = (date?: any) => {
  return new Date(date?._seconds * 1000);
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));

  const historicalVolume: HistoricalTotalVolume[] = await getHistoricalTVL();

  const totalVolume = historicalVolume
    .filter((volItem) => getDate(volItem.date).getTime() / 1000 <= dayTimestamp)
    .reduce((acc, { tvl }) => acc + tvl, 0);

  const dailyVolume = historicalVolume.find(
    (dayItem) => getDate(dayItem.date).getTime() / 1000 === dayTimestamp
  )?.tvl;

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: HistoricalTotalVolume[] = await getHistoricalTVL();
  return getDate(historicalVolume[0].date).getTime() / 1000;
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
