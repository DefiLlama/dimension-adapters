import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://api.crema.finance/v1/histogram?date_type=day&typ=vol&limit=1000"

interface IVolumeall {
  num: string;
  date: string;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint))?.data.list;

  const dailyVolume = historicalVolume
    .find(dayItem => (new Date(dayItem.date.split('T')[0]).getTime() / 1000) === options.startOfDay)?.num

  return {
    dailyVolume,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.SOLANA],
  start: '2022-10-14',
};

export default adapter;
