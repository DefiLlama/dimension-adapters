import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface IValue {
  time: number;
  volume: string;
}
const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const data: IValue[] = (await fetchURL("https://sbc.endjgfsv.link/scan/volume?version=v3&startDate=2023-12-16")).data?.list;
  const dailyVolume = data.find((item) => (item.time / 1000) === options.startOfDay)?.volume ?? "0";
  return { dailyVolume };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.TRON],
  start: '2023-12-16',
}

export default adapter;
