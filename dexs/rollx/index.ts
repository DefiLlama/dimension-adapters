import { Chain } from "../../adapters/types";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const v2VolumeAPI =
  "https://adm.rolldex.io/api/trade/query/dailyTradeVol";

async function sleep (time: number) {
  return new Promise<void>((resolve) => setTimeout(() => resolve(), time))
}

const fetchVolume = async (timestamp: number,chain: Chain) => {
  const res = (
    await httpGet(v2VolumeAPI, { params: { chain:chain, timestamp: timestamp } })
  ) as  {data , success: boolean }
  if (res.data.dailyVolume == "" && res.success === false) {
    return fetchVolume(timestamp,chain)
  }
  const dailyVolume = res.data.dailyVolume
  return { dailyVolume }
};


const fetch = async (timestamp: number, _a:any, options: FetchOptions) => {
  let dailyVolume = 0;
  const data = await fetchVolume(timestamp, options.chain);
  dailyVolume += data.dailyVolume;
  return { dailyVolume}
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.BITLAYER]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-06-22',
    },
    [CHAIN.BASE]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-06-22',
    },
  },
};

export default adapter;
