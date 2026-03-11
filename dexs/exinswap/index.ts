import fetchURL from "../../utils/fetchURL"
import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

const URL = "https://app.exinswap.com/api/v1/statistic/total/chart?type=volume"

interface IAPIResponse {
  time: number;
  volume: number;
};

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const response: IAPIResponse[] = (await fetchURL(URL))?.data.list.map((e: any) => {
    return {
      time: e[0],
      volume: e[1]
    } as IAPIResponse
  });

  const dailyVolume = response
    .find(dayItem => getUniqStartOfTodayTimestamp(new Date(Number(dayItem.time * 1000))) === dayTimestamp)?.volume

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MIXIN]: {
      fetch,
      start: '2020-09-21',
    },
  }
};

export default adapter;
