import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const statsurl = 'https://api.solarstudios.co/pools/info/list?poolType=all&poolSortField=fee24h&sortType=desc&pageSize=1000&page=1';

const fetchVolume = async (timestamp: number, _:any, options: FetchOptions): Promise<any> => {
  const res = await httpGet(statsurl);
  const dailyFees = options.createBalances();
  res.data.data.map((i: any) => {
    dailyFees.addUSDValue(Number(i.day.volumeFee))
  });
  return {
    dailyFees,
    timestamp: timestamp
  }
}

const adapters: SimpleAdapter = {
  adapter: {
    [CHAIN.ECLIPSE]: {
      fetch: fetchVolume,
      runAtCurrTime: true,
      start: '2024-10-20',
    }
  }
}

export default adapters;
