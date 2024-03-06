
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const START_TIMESTAMP = 1698076570;
interface IData {
  record_date: string;
  value: string;
}
const getUrl = (end: number) => `https://api-scroll.luigiswap.finance/report/volume-day?start_time=${START_TIMESTAMP}&end_time=${end}`;
const fetchVolume = async (timestamp: number) => {
  const response: IData[] = (await fetchURL(getUrl(timestamp))).data;
  const dateString = new Date(timestamp * 1000).toISOString().split("T")[0];
  const dailyVolume = response.find((e: IData) => e.record_date.split('T')[0] === dateString)?.value;
  return {
    dailyVolume: `${dailyVolume}`,
    timestamp,
  }
}
const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.SCROLL]: {
      fetch: fetchVolume,
      start: START_TIMESTAMP,
    },
  },
};
export default adapters;
