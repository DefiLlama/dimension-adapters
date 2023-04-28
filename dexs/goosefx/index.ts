

import fetchURL from "../../utils/fetchURL"
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const dailyVolumeEndpoint = "https://api-services.goosefx.io/getTotalVolumeTrade";

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const res = await fetchURL(dailyVolumeEndpoint);
  return {
    dailyVolume: res?.data?.data?.totalVolumeTradeDay,
    totalVolume: res?.data?.data?.totalVolumeTrade,
    timestamp: dayTimestamp
  };
};

const adapter: SimpleAdapter = {
    adapter: {
      [CHAIN.SOLANA]: {
        fetch: fetch,
        start: async () => 1664360407,
        runAtCurrTime: true
      },
    },
  };

  export default adapter;
