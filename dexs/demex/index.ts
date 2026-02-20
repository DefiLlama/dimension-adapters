import fetchURL from "../../utils/fetchURL";
import { BreakdownAdapter, } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const START_TIME = 1659312000;
const historicalVolumeEndpoint = () => `https://api.carbon.network/carbon/marketstats/v1/stats`;

interface IVolumeall {
  market_type: string;
  day_quote_volume: string;
  date: string;
}

const fetch = (market_type: string) => {
  return async () => {
    const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint()))?.marketstats;

    const volume =
      historicalVolume
        .filter((e: IVolumeall) => e.market_type === market_type)
        .reduce((a: number, b: IVolumeall) => a + Number(b.day_quote_volume), 0) / 1e18;

    return {
      dailyVolume: volume,
    };
  };
};

const adapters: BreakdownAdapter = {
  breakdown: {
    demex: {
      [CHAIN.CARBON]: {
        fetch: fetch("spot"),
        runAtCurrTime: true,
        start: START_TIME,
      },
    },
    "demex-perp": {
      [CHAIN.CARBON]: {
        fetch: fetch("futures"),
        runAtCurrTime: true,
        start: START_TIME,
      },
    }
  },
};

export default adapters;
