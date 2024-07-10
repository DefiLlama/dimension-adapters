import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

interface IVolumeall {
  totalVolumeUSD: string;
  dailyVolumeUSD: Array<{
    startDateTime: string;
    dailyVolumeUSD: string;
  }>
}

const baseUrl = "https://stats-api.panora.exchange";
const endpoint = "getDefiLlamaStats";

const fetch = async (options: FetchOptions) => {
  const timestamp = options.startOfDay
  const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];
  const response: IVolumeall = (await httpGet(`${baseUrl}/${endpoint}`));
  const totalVolume = response.totalVolumeUSD;
  const dailyVolume = response.dailyVolumeUSD.find((d) => d.startDateTime.split('T')[0] === dateStr);
  return {
    dailyVolume: dailyVolume?.dailyVolumeUSD,
    totalVolume
  }
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.APTOS]: {
      fetch,
      start: 1701129600,
    },
  },
};

export default adapter;
