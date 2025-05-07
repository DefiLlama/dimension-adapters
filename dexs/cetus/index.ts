import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const url: any = {
  [CHAIN.APTOS]: {
    countUrl: 'https://api.cetus.zone/v2/swap/count',
    histogramUrl: "https://api.cetus.zone/v2/histogram?date_type=day&typ=vol&limit=99999",
  },
  [CHAIN.SUI]: {
    countUrl: 'https://api-sui.cetus.zone/v2/sui/swap/count/v3',
    histogramUrl: "https://api-sui.cetus.zone/v2/sui/histogram?date_type=day&typ=vol&limit=99999"
  }
}

async function fetch(_: any, _1: any, { startOfDay, chain, }: FetchOptions) {
  const historicalVolume: any[] = (await fetchURL(url[chain].histogramUrl)).data.list;
  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date.split('T')[0]).getTime() / 1000) === startOfDay)?.num
  return {
    dailyVolume: dailyVolume,
    timestamp: startOfDay,
  };
}

async function fetchSUI(_: any, _1: any, { startTimestamp, endTimestamp }: FetchOptions) {
  const dailyVolume = (await fetchURL(`https://api-sui.cetus.zone/v3/sui/vol/time_range?date_type=hour&start_time=${startTimestamp}&end_time=${endTimestamp}`)).data.vol_in_usd;
  return {
    dailyVolume: dailyVolume,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2022-10-20',
    },
    [CHAIN.SUI]: {
      fetch: fetch,
      start: '2023-05-02',
    }
  }
};

export default adapter;