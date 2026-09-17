import { FetchResultVolume, SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

interface IValue {
  time: number;
  volume: string;
}
const fetch = async (options: FetchOptions): Promise<FetchResultVolume> => {
  const data: IValue[] = (await fetchURL("https://sbc.endjgfsv.link/scan/volume?version=v3")).data?.list;
  if (!Array.isArray(data))
    throw new Error("sunswap-v3: the volume endpoint returned no list");
  const day = data.find((item) => (item.time / 1000) === options.startOfDay);
  if (!day)
    throw new Error(`sunswap-v3: the volume endpoint has no row for ${options.dateString}`);
  return { dailyVolume: day.volume };
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.TRON],
  start: '2023-12-16',
}

export default adapter;
