import fetchURL from "../../utils/fetchURL";
import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, SimpleAdapter, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
  [s: string]: {
    histogramUrl: string;
  };
};

const url: IUrl = {
  [CHAIN.SUI]: {
    histogramUrl:
      "https://app.magmafinance.io/api/sui/histogram?date_type=day&typ=vol&limit=99999",
  },
};

interface IVolumeData {
  num: string;
  date: string;
}


async function fetchHistoricalVolume(chain: Chain): Promise<IVolumeData[]> {
  const response = await fetchURL(url[chain].histogramUrl);
  return response.data.list;
}

function calculateDailyVolume(historicalVolume: IVolumeData[], dateStr: string): string | undefined {
  return historicalVolume.find(
    (dayItem) => dayItem.date.split('T')[0] === dateStr
  )?.num;
}

function calculateTotalVolume(historicalVolume: IVolumeData[]): string {
  return historicalVolume.reduce(
    (acc, item) => acc + Number(item.num),
    0
  ).toString();
}

const fetch = (chain: Chain) => {
  return async (_tt: any,_t: any, options: FetchOptions): Promise<FetchResult> => {
    const date = new Date(options.startOfDay * 1000);
    const dateStr = date.toISOString().split('T')[0];  // Format: YYYY-MM-DD
    const dayTimestamp = getUniqStartOfTodayTimestamp(date);

    const historicalVolume = await fetchHistoricalVolume(chain);
    const dailyVolume = calculateDailyVolume(historicalVolume, dateStr);
    const totalVolume = calculateTotalVolume(historicalVolume);

    return {
      timestamp: dayTimestamp,
      dailyVolume,
      totalVolume,
    };
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch(CHAIN.SUI),
      start: "2025-02-12",
    },
  },
};

export default adapter;
