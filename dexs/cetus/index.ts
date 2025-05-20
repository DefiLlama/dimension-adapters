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
  return async ({ startTimestamp, endTimestamp }: FetchOptions) => {
    if (chain === CHAIN.SUI) {
      const totalVolume =(await fetchURL(`https://api-sui.cetus.zone/v2/sui/vol/time_range?date_type=hour&start_time=0&end_time=${endTimestamp}`)).data.vol_in_usd;
      const dailyVolume =(await fetchURL(`https://api-sui.cetus.zone/v2/sui/vol/time_range?date_type=hour&start_time=${startTimestamp}&end_time=${endTimestamp}`)).data.vol_in_usd;
      const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(endTimestamp * 1000))
      return {
        totalVolume: `${totalVolume}`,
        dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
        timestamp: dayTimestamp,
      };
    }
    const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(endTimestamp * 1000))
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
        start: '2022-10-20',
      },
      [CHAIN.SUI]: {
        fetch: fetch(CHAIN.SUI),
        start: '2023-05-02',
      }
  }
};

export default adapter;