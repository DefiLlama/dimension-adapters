import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://megaton.fi/api/dashboard/info?"

interface IVolumeall {
  amount: string;
  dateId: string;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint)).dayVolume;
  const dateString = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  const dailyVolume = historicalVolume
    .find(dayItem => dayItem.dateId.split('T')[0] === dateString)?.amount

  return {
    dailyVolume: dailyVolume,
  };
};


const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.TON],
  start: '2023-02-08',
};

export default adapter;
