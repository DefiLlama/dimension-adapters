import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface IVolumeall {
  dailyVolumeUSD: Array<{
    startDateTime: string;
    dailyVolumeUSD: string;
  }>
}

const url = "https://stats-api.panora.exchange/getDefiLlamaStats";

const fetch = async (options: FetchOptions) => {
  const timestamp = options.startOfDay
  const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];
  const response: IVolumeall = await fetchURL(url);

  const dailyVolume = response.dailyVolumeUSD.find((d) => d.startDateTime.split('T')[0] === dateStr);

  return {
    dailyVolume: dailyVolume?.dailyVolumeUSD || '0'
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: '2023-11-28',
    },
  },
};

export default adapter;
