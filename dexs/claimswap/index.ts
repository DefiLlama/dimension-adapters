
import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

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

const fetch = async (options: FetchOptions) => {
  const dateToday = new Date(options.toTimestamp * 1000);
  const startTime = new Date(START_TIME * 1000);
  const query = `?startdt=${startTime.toISOString()}&enddt=${dateToday.toISOString()}&timeunit=day`;
  const url = `${endpoint}${query}`
  const response: IRawResponse = (await fetchURL(url));

  const historicalVolume: IVolume[] = response.data.map((val: number, index: number) => {
    return {
      time: response.label[index],
      volume: val
    } as IVolume
  });

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.time).getTime() / 1000) === options.startOfDay)?.volume

  return { dailyVolume };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.KLAYTN],
  start: START_TIME,
};

export default adapter;
