import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const URLEndpoint = "https://mainnetapiserver.logx.network/api/v1/stats/defillama/options?endTime=";
const startTimestamp = 1733961600; // 12.12.2024

interface IAPIResponse {
  last24HourVolume: string;
  totalVolume: string;
}
const fetch = async (timestamp: number): Promise<FetchResult> => {
  const { last24HourVolume, totalVolume }: IAPIResponse = (
    await fetchURL(`${URLEndpoint}${timestamp}`)
  );

  return {
    totalPremiumVolume: totalVolume,
    dailyPremiumVolume: last24HourVolume,
    timestamp: timestamp,
    dailyNotionalVolume: last24HourVolume,
    totalNotionalVolume: totalVolume,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.LOGX]: {
      fetch,
      start: startTimestamp,
    },
  }
};

export default adapter;
