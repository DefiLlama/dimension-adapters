import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const URL = "https://app.exinswap.com/api/v1/statistic/total/chart?type=volume"

interface IAPIResponse {
  time: number;
  volume: number;
};

const fetch = async (options: FetchOptions) => {
  const response: IAPIResponse[] = (await fetchURL(URL))?.data.list.map((e: any) => {
    return {
      time: e[0],
      volume: e[1]
    } as IAPIResponse
  });

  const dailyVolume = response
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(Number(dayItem.time * 1000))) === options.startOfDay)?.volume

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.MIXIN],
  start: '2020-09-21',
};

export default adapter;
