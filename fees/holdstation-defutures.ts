import fetchURL from "../utils/fetchURL"
import { FetchResultFees, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (from: string, to: string) => `https://api-trading.holdstation.com/api/fees/summary?fromDate=${from}&toDate=${to}`

interface IFees {
  totalFee: string;
  govFee: string;
  vaultFee: string;
}

const fetch = async (timestamp: number): Promise<FetchResultFees> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const fromTimestamp = new Date((dayTimestamp) * 1000).toISOString().split("T")[0];
  const toTimestamp = new Date((dayTimestamp + 60 * 60 * 24) * 1000).toISOString().split("T")[0];
  const data: IFees = (await fetchURL(historicalVolumeEndpoint(fromTimestamp, toTimestamp))).data.result;
  const dailyFees = data.totalFee;
  const dailyRevenue = data.govFee;
  const dailySupplySideRevenue = data.vaultFee;
  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    dailySupplySideRevenue: `${dailySupplySideRevenue}`,
    timestamp: dayTimestamp,
  };
};


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch,
      start: async () => 1683590400,
    },
  },
};

export default adapter;
