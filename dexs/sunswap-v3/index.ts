import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface IValue {
  time: number;
  volume: string;
}
const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const url = `https://sbc.endjgfsv.link/scan/volume?version=v3&startDate=${options.dateString}&endDate=${options.dateString}`;
  const data: IValue[] = (await fetchURL(url)).data?.list;
  const dayItem = data?.find((item) => (item.time / 1000) === options.startOfDay);
  if (!dayItem) throw new Error(`No volume data for ${options.dateString}`);
  return { dailyVolume: dayItem.volume };
}

const adapter: SimpleAdapter = {
  version: 1,
  fetch,
  chains: [CHAIN.TRON],
  start: '2023-12-16',
  methodology: {
    Volume: 'Daily USD swap volume across all SunSwap V3 pools on Tron',
  },
}

export default adapter;
