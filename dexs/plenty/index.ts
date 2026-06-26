import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter, FetchOptions } from "../../adapters/types";

interface IVolumeall {
  value: string;
  time: string;
}
const fetch = async (options: FetchOptions) => {
  const plentyData: IVolumeall[] = (await fetchURL("https://analytics.plenty.network/api/v1/overall-volume/24hours"));
  const dailyVolumeItem = plentyData.find(e => e.time === options.dateString)?.value

  return {
    dailyVolume: dailyVolumeItem,
  }
}

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.TEZOS],
  start: '2023-01-01',
};

export default adapter
