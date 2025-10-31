import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const v2VolumeAPI = "https://adm.rolldex.io/api/trade/query/dailyTradeVol";

const chainConfig = {
  [CHAIN.BITLAYER]: {
    start: '2024-06-22',
  },
  [CHAIN.BASE]: {
    start: '2024-06-22',
  },
}

const fetch = async (_a: any, _b: any, options: FetchOptions) => {
  const res = (
    await httpGet(v2VolumeAPI, { params: { chain: options.chain, timestamp: options.startOfDay } })
  ) as { data: { dailyVolume: number }, success: boolean }

  return {
    dailyVolume: res.data.dailyVolume
  }
};


const adapter: SimpleAdapter = {
  fetch,
  adapter: chainConfig
};

export default adapter;
