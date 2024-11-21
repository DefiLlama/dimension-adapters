import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const statsurl = 'https://stats.invariant.app/svm/full_snap/eclipse-mainnet';

const fetchVolume = async (timestamp: number, _:any, options: FetchOptions): Promise<any> => {
  const res = await httpGet(statsurl);
  const dailyFees = options.createBalances();
  dailyFees.addUSDValue(res.fees24.value);
  return {
    dailyFees: dailyFees,
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
