import fetchURL from "../../utils/fetchURL";
import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
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

interface IVolumeall {
  num: string;
  date: string;
}

const fetch = (chain: Chain) => {
  return async (options: FetchOptions) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(
      new Date(options.endTimestamp * 1000),
    );
    const historicalVolume: IVolumeall[] = (
      await fetchURL(url[chain].histogramUrl)
    ).data.list;
    const dailyVolume = historicalVolume.find(
      (dayItem) =>
        new Date(dayItem.date.split("T")[0]).getTime() / 1000 === dayTimestamp,
    )?.num;
    const totalVolume = historicalVolume.reduce(
      (acc, item) => acc + Number(item.num),
      0,
    );

    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  };
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetch(CHAIN.SUI),
      start: "2025-02-12",
    },
  },
};

export default adapter;
