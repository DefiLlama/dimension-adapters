import fetchURL from "../../utils/fetchURL";
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalDataEndpoint = "https://api.scopuly.com/api/liquidity_pools_volume"

interface IChartItem {
  vol: number;
  time: number;
  fees: number;
}

const fetch = async (timestamp: number, _: any, options: FetchOptions) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const historicalData: IChartItem[] = await fetchURL(historicalDataEndpoint)

  const findDay = (items: IChartItem[]) =>
    items.find(item => getUniqStartOfTodayTimestamp(new Date(Number(item.time))) === dayTimestamp)

  const item = findDay(historicalData)

  if (!item)
    throw new Error(`No data found for date ${options.dateString}`)

  return {
    dailyVolume: item.vol,
    dailyFees: item.fees,
    dailyUserFees: item.fees,
    dailyRevenue: "0",
    dailyProtocolRevenue: "0",
    dailySupplySideRevenue: item.fees,
    timestamp: dayTimestamp,
  };
};

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.STELLAR]: {
      fetch,
      start: '2024-01-30',
    },
  },
  doublecounted: true, //stellar dex
};

export default adapter;
