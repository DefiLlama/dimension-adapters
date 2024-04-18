import { FetchOptions, FetchV2, SimpleAdapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";

interface ITransferStatsResponse {
  volume24hUsdt: string;
  volume24hUsdtChange: string;
  volume7dUsdt: string;
  volume7dUsdtChange: string;
  fromEverscaleUsdt: string;
  toEverscaleUsdt: string;
}

const fetch: FetchV2 = async (options: FetchOptions) => {
  const response: ITransferStatsResponse = await fetchURL(
    "https://api.venombridge.com/v1/transfers/main_page"
  );
  return {
    dailyVolume: response.volume24hUsdt,
  };
};
const adapter: SimpleAdapter = {
  adapter: {
    venom: {
      fetch,
      runAtCurrTime: true,
      start: 1713312000, // 2024-04-17T00:00:00.000Z
    },
  },
  version: 2,
};

export default adapter;
