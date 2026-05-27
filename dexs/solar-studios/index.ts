import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const statsurl = 'https://api.solarstudios.co/pools/info/list?poolType=all&poolSortField=volume24h&sortType=desc&pageSize=1000&page=1';

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<any> => {
  const res = await httpGet(statsurl);
  const dailyVolume = options.createBalances();

  res.data.data.map((i: any) => {
    dailyVolume.addUSDValue(Number(i.day.volume))
  });

  return { dailyVolume }
}

const adapters: SimpleAdapter = {
  version: 1,
  fetch,
  start: '2024-10-20',
  deadFrom: '2026-01-01',
  runAtCurrTime: true,
  chains: [CHAIN.ECLIPSE],
}

export default adapters;
