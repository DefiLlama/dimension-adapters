import { time } from "console";
import { FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

interface IValue {
  time: number;
  volume: string;
}
const fetchVolume = async (timestamp: number): Promise<FetchResultVolume> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const data: IValue[] = (await fetchURL("https://sbc.endjgfsv.link/scan/volume?version=v3&startDate=2023-12-16")).data?.list;
  const dailyVolume = data.find((item) => (item.time / 1000) === dayTimestamp)?.volume ?? "0";
  return {
    dailyVolume: dailyVolume,
    timestamp: timestamp,
  };
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.TRON]: {
      start: '2023-12-16',
      fetch: fetchVolume,
    }
  }
}
export default adapters;
