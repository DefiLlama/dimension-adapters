import fetchURL from "../../utils/fetchURL";
import { BreakdownAdapter, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const START_TIME = 1659312000;
const historicalVolumeEndpoint = () => `https://api.carbon.network/carbon/marketstats/v1/stats`;

interface IVolumeall {
  market_type: string;
  day_quote_volume: string;
  date: string;
}

const fetch = (market_type: string) => {
  return async (timestamp: number) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
    const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint()))?.marketstats;

    const volume =
      historicalVolume
        .filter((e: IVolumeall) => e.market_type === market_type)
        .reduce((a: number, b: IVolumeall) => a + Number(b.day_quote_volume), 0) / 1e18;

    return {
      dailyVolume: volume,
      timestamp: dayTimestamp,
    };
  };
};

const adapters: BreakdownAdapter = {
  breakdown: {
    demex: {
      [CHAIN.CARBON]: {
        fetch: fetch("spot"),
        start: START_TIME,
      },
    },
    "demex-perp": {
      [CHAIN.CARBON]: {
        fetch: fetch("futures"),
        start: START_TIME,
      },
    }
  },
};

export default adapters;
