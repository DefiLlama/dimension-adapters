
import fetchURL from "../../utils/fetchURL"
import { Chain } from "@defillama/sdk/build/general";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import customBackfill from "../../helpers/customBackfill";
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

  const totalVolume = historicalVolume
  .filter(volItem => (new Date(volItem.time).getTime() / 1000) <= dayTimestamp)
  .reduce((acc, { volume }) => acc + Number(volume), 0)

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.time).getTime() / 1000) === dayTimestamp)?.volume

  return {
    totalVolume: `${totalVolume}`,
    dailyVolume: dailyVolume ? `${dailyVolume}` : undefined,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.KLAYTN]: {
      fetch,
      customBackfill: customBackfill(CHAIN.KLAYTN as Chain, (_chian: string) => fetch),
      start: START_TIME,
    },
  }
};

export default adapter;
