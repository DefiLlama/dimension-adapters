
import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const endpoint = "https://data-api.claimswap.org/dashboard/charts/tradingvolume";
interface IRawResponse {
  data: number[];
  label: string[];
}

interface IVolume {
  time: string;
  volume: number;
}


const START_TIME = 1644568448;

const fetch = async (timestamp: number) => {
  const dateToday = new Date(timestamp * 1000);
  const startTime = new Date(START_TIME * 1000);
  const query = `?startdt=${startTime.toISOString()}&enddt=${dateToday.toISOString()}&timeunit=day`;
  const url = `${endpoint}${query}`
  const dayTimestamp = getUniqStartOfTodayTimestamp(dateToday);
  const response: IRawResponse = (await fetchURL(url));

  const historicalVolume: IVolume[] = response.data.map((val: number, index: number) => {
    return {
      time: response.label[index],
      volume: val
    } as IVolume
  });

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.time).getTime() / 1000) === dayTimestamp)?.volume

  return {
    dailyVolume: dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      start: START_TIME,
    },
  }
};

export default adapter;
