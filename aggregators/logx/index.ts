import fetchURL from "../../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = "https://logx-data-analytics-xmxmxbqxaq-uc.a.run.app/";
const endpoint = "defillama/defillama/";
const startTimestamp = 1686205277; // 08.06.2023

interface IAPIResponse {
  dailyVolume: string;
  totalVolume: string;
}
const fetch = async (timestamp: number): Promise<FetchResult> => {
  const { dailyVolume, totalVolume }: IAPIResponse = (
    await fetchURL(`${URL}${endpoint}${timestamp}`)
  );
  return {
    dailyVolume,
    totalVolume,
    timestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: startTimestamp,
    },
  },
};

export default adapter;
