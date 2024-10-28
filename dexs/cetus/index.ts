import fetchURL from "../../utils/fetchURL";
import { Chain } from "@defillama/sdk/build/general";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

type IUrl = {
  [s: string]: {
    countUrl: string,
    histogramUrl: string,
  };
}


const url: IUrl = {
  [CHAIN.APTOS]: {
    countUrl: 'https://api.cetus.zone/v2/swap/count',
    histogramUrl: "https://api.cetus.zone/v2/histogram?date_type=day&typ=vol&limit=99999",
  },
  [CHAIN.SUI]: {
    countUrl: 'https://api-sui.cetus.zone/v2/sui/swap/count/v3',
    histogramUrl: "https://api-sui.cetus.zone/v2/sui/histogram?date_type=day&typ=vol&limit=99999"
  }
}


interface IVolumeall {
  num: string;
  date: string;
}

const fetch = (chain: Chain) => {
  return async (options: FetchOptions) => {
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(options.endTimestamp * 1000))
    const historicalVolume: IVolumeall[] = (await fetchURL(url[chain].histogramUrl)).data.list;
    const totalVolume = (await fetchURL(url[chain].countUrl)).data.vol_in_usd
    const dailyVolume = historicalVolume
      .find(dayItem => (new Date(dayItem.date.split('T')[0]).getTime() / 1000) === dayTimestamp)?.num
    return {
      totalVolume: `${totalVolume}`,
      dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
      timestamp: dayTimestamp,
    };
  };
}




const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
      [CHAIN.APTOS]: {
        fetch: fetch(CHAIN.APTOS),
        start: 1666224000,
      },
      [CHAIN.SUI]: {
        fetch: fetch(CHAIN.SUI),
        start: 1682985600,
      }
  }
};

export default adapter;
