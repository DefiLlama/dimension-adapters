import { httpGet } from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const URLEndpoint = "https://mainnetapiserver.logx.network/api/v1/stats/dashboard";
const startTimestamp = 1725580800; // 06.09.2024


const fetch = async (_: number, _1:any, { dateString }: FetchOptions) => {
  const { dailyVolumes} = await httpGet(URLEndpoint)
  const volume = dailyVolumes.find(i => i.date.slice(0, 10) === dateString)
  if (!volume)
    throw new Error('Error fetching data')
  
  return {
    dailyVolume: volume.count,
  };
};

const adapter: SimpleAdapter = {
  // deadFrom: '2025-09-10',
  adapter: {
    [CHAIN.LOGX]: {
      fetch,
      start: startTimestamp,
    },
  }
};

export default adapter;
