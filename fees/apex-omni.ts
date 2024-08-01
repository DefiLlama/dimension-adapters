import { FetchResultFees, SimpleAdapter } from "../adapters/types"
import { CHAIN } from "../helpers/chains";
import { getTimestampAtStartOfDayUTC } from "../utils/date"
import fetchURL from "../utils/fetchURL"


interface IFees {
  feeOfDate: string;
}
const fees = async (timestamp: number): Promise<FetchResultFees> => {
  const todaysTimestamp = getTimestampAtStartOfDayUTC(timestamp) * 1000;
  const url = `https://omni.apex.exchange/api/v3/data/fee-by-date?time=${todaysTimestamp}`;
  const feesData: IFees = (await fetchURL(url)).data;
  const dailyFees = feesData?.feeOfDate || '0';
  return {
    dailyFees: dailyFees,
    dailyUserFees: dailyFees,
    timestamp
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
