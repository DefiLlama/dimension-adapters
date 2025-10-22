// source for fees: https://www.paradex.trade/stats
import fetchURL from "../../utils/fetchURL"
import { FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const feesEndpoint = "https://tradeparadigm.metabaseapp.com/api/public/dashboard/e4d7b84d-f95f-48eb-b7a6-141b3dcef4e2/dashcard/5913/card/5760?parameters=%5B%5D"

interface IFeesData {
  data: {
    rows: [string, number][];
  }
}

const fetch = async (timestamp: number): Promise<FetchResult> => {
  // Fetch fees data
  const feesData = await fetchURL(feesEndpoint) as IFeesData
  const timestampStr = new Date(timestamp * 1000).toISOString().split('T')[0] + "T00:00:00Z"
  const dailyFees = feesData.data.rows.find(row => row[0] === timestampStr)?.[1]
  if (!dailyFees) throw new Error('record missing!')

  return { 
    timestamp, 
    dailyFees,
    dailyUserFees: dailyFees
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.PARADEX]: {
      fetch,
      start: '2023-09-01',
    },
  },
};

export default adapter; 
