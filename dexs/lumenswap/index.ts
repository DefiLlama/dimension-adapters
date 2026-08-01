import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const historicalVolumeEndpoint = "https://api.lumenswap.io/amm/stats/overall"

interface IVolumeall {
  volume: string;
  tokenPrice: string;
  periodTime: string;
}

const fetch = async (options: FetchOptions) => {
  const historicalVolume: IVolumeall[] = (await fetchURL(historicalVolumeEndpoint));

const dailyVolume = historicalVolume
  .find(dayItem => (new Date(dayItem.periodTime.split('T')[0]).getTime() / 1000) === options.startOfDay)?.volume

  return {
    dailyVolume: dailyVolume ? `${Number(dailyVolume) / 10 ** 7}` : undefined,
  };
};

const adapter: SimpleAdapter = {
  fetch,
  chains: [CHAIN.STELLAR],
  start: '2022-04-01',
};

export default adapter;
