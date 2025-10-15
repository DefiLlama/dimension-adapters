import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


async function fetchSUI(_: any, _1: any, { startTimestamp, endTimestamp }: FetchOptions) {

  // const hackDay = (+new Date('2025-05-22')) / 1e3
  // if (endTimestamp > hackDay) return { dailyVolume: 0 }  // dex is paused
  const dailyVolume = (await fetchURL(`https://api-sui.cetus.zone/v3/sui/vol/time_range?date_type=hour&start_time=${startTimestamp}&end_time=${endTimestamp}`)).data.vol_in_usd;
  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SUI]: {
      fetch: fetchSUI,
      start: '2023-05-02',
    }
  }
};

export default adapter;