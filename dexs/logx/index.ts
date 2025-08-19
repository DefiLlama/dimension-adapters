import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


const URLEndpoint = "https://apiserver.logx.network/api/v1/stats/defillama?endTime=";
const startTimestamp = 1725580800; // 06.09.2024

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
    [CHAIN.LOGX]: {
      fetch,
      start: startTimestamp,
    },
  }
};

export default adapter;
