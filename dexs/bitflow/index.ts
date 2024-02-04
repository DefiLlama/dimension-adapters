import fetchURL from "../../utils/fetchURL";
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";

const historicalVolumeEndpoint = "https://app.bitflow.finance/api/totalVolume";

const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

interface Timestamp {
  _seconds: number;
  _nanoseconds: number;
}

type LPTokenTVL = {
  totalShares: number;
  dollarPrice: number;
  totalSharesInDollars: number;
};

type TVL = {
  pairs: Record<string, LPTokenTVL>;
  total: number;
};

interface HistoricalTotalVolume {
  date: Timestamp;
  tvl: TVL;
}

const fetch = async (timestamp: number) => {
  const historicalVolume: HistoricalTotalVolume[] = await getHistoricalTVL();

  const totalVolume = historicalVolume[historicalVolume.length - 1].tvl.total;

  const dailyVolume = getDailyVolume(timestamp, historicalVolume);

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: `${dailyVolume ?? 0}`,
    timestamp,
  };
};

const getStartTimestamp = async () => {
  const historicalVolume: HistoricalTotalVolume[] = await getHistoricalTVL();
  return historicalVolume[0].date._seconds;
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

const getHistoricalTVL = async (): Promise<HistoricalTotalVolume[]> => {
  return (await fetchURL(historicalVolumeEndpoint)).data.data;
};

const getDailyVolume = async (
  timestamp: number,
  historicalVolume: HistoricalTotalVolume[]
) => {
  const startOfDay = timestamp - ONE_DAY_IN_SECONDS;
  const endOfDay = timestamp;

  const dayTVL = historicalVolume.find(
    (dayItem) =>
      dayItem.date._seconds > startOfDay && dayItem.date._seconds <= endOfDay
  );

  if (!dayTVL) return;

  const dayTVLIndex = historicalVolume.indexOf(dayTVL) - 1;

  const dayBeforeTVL = historicalVolume[dayTVLIndex >= 0 ? dayTVLIndex : 0];

  return dayTVL.tvl.total - dayBeforeTVL.tvl.total;
};
