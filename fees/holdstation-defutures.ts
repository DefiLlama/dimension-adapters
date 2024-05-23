import fetchURL from "../utils/fetchURL";
import { FetchResult, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = (from: string, to: string) =>
  `https://api-trading.holdstation.com/api/fees/summary?fromDate=${from}&toDate=${to}`;
const dailyVolumeEndpoint = (from: string, to: string) =>
  `https://api-trading.holdstation.com/api/trading-history/volume-by-day?fromDate=${from}&toDate=${to}`;

interface IFees {
  totalFee: string;
  govFee: string;
  vaultFee: string;
}

interface DailyVolume {
  date: string;
  volume: string;
  totalVolume: string;
}

const fetch = async (timestamp: number): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const fromTimestamp = new Date(dayTimestamp * 1000).toISOString().split("T")[0];
  const toTimestamp = new Date((dayTimestamp + 60 * 60 * 24) * 1000).toISOString().split("T")[0];
  const data: IFees = (await fetchURL(historicalVolumeEndpoint(fromTimestamp, toTimestamp))).result;
  const dailyVolume: DailyVolume[] = (await fetchURL(dailyVolumeEndpoint(fromTimestamp, fromTimestamp)));

  const dailyFees = data.totalFee;
  const dailyRevenue = data.govFee;
  const dailySupplySideRevenue = data.vaultFee;

  return {
    dailyFees: `${dailyFees}`,
    dailyRevenue: `${dailyRevenue}`,
    dailyVolume: dailyVolume.length > 0 ? dailyVolume[0].volume : "0",
    totalVolume: dailyVolume.length > 0 ? dailyVolume[0].totalVolume : "0",
    dailySupplySideRevenue: `${dailySupplySideRevenue}`,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.ERA]: {
      fetch,
      start: 1683590400,
    },
  },
};

export default adapter;
