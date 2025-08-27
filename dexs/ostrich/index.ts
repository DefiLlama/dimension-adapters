import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const URLEndpoint = "https://mainnetapiserver.ostrich.exchange/api/v1/stats/defillama-ostrich?endTime=";
const startTimestamp = 1748827388; // 01.06.2025

interface IAPIResponse {
  last24HourVolume: string;
  totalVolume: string;
}
const fetch = async (timestamp: number): Promise<FetchResult> => {
  const { last24HourVolume, }: IAPIResponse = (
    await fetchURL(`${URLEndpoint}${timestamp}`)
  );
  return {
    dailyVolume: last24HourVolume,
    timestamp: timestamp
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: startTimestamp,
    },
  }
};

export default adapter;