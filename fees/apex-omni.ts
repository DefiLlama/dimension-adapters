import { FetchOptions, FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date"
import fetchURL, { httpGet } from "../utils/fetchURL"


interface IFees {
  feeOfDate: string;
}
const fees = async (_:any, _b: any, options: FetchOptions): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(options.startOfDay) * 1000;
  const url = `https://omni.apex.exchange/api/v3/data/fee-by-date?time=${todaysTimestamp}`;
  const feesData: IFees = (await httpGet(url, { timeout: 10000 })).data;
  const dailyFees = feesData?.feeOfDate || '0';
  return {
    dailyFees: dailyFees,
    dailyUserFees: dailyFees,
    timestamp: todaysTimestamp
  }
}
const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fees,
      start: 1693440000,
    }
  }
}
export default adapter;
