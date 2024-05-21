import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { getTimestampAtStartOfDayUTC } from "../../utils/date";
import { log } from "console";


// Define the interface for the data you expect to receive from the API.
interface DailyStats {
  feesUSDT: number;
  revenueUSDT:number
}

const fetch = async (timestampSeconds: number, _: any, options: FetchOptions) => {
  
  const url = "https://api.idlemine.io/api/admin/user/revenue";
  const response = await fetchURL(url);
  const responsedata = response.data;
  console.log(responsedata, 'responsedata');
  // const totalRevenue = options.createBalances();
  // const totalFees = options.createBalances();
  // totalRevenue.add('0x55d398326f99059fF775485246999027B3197955', responsedata.Totalrevenue * 1e18);
  // totalFees.add('0x55d398326f99059fF775485246999027B3197955', responsedata.Fee * 1e18);
  
  return {
    timestamp: timestampSeconds,
    totalFees: responsedata.Fee   || 0,
    totalRevenue: responsedata.Totalrevenue  || 0,
  };
};

const adapter: Adapter = {
  version: 2,
  adapter: {
    [CHAIN.BSC]: {
      fetch,
      start: 1709251200, // Start timestamp in seconds.
      meta: {
        methodology: "idlemine revenue from idlemine thumb game and idlemine battle games",
      },
    },
  },
};

export default adapter;
