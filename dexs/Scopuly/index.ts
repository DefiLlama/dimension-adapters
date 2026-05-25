import fetchURL from "../../utils/fetchURL";
import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const historicalVolumeEndpoint = "https://api.scopuly.com/api/liquidity_pools_volume"
const historicalFeesEndpoint = "https://api.scopuly.com/api/liquidity_pools_fees"

interface IChartItem {
  vol: number;
  time: number;
  fees: number;
}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000))
  const [historicalVolume, historicalFees]: IChartItem[][] = await Promise.all([
    fetchURL(historicalVolumeEndpoint),
    fetchURL(historicalFeesEndpoint),
  ]);

  const findDay = (items: IChartItem[]) =>
    items.find(item => getUniqStartOfTodayTimestamp(new Date(Number(item.time))) === dayTimestamp)

  const volItem = findDay(historicalVolume)
  const feeItem = findDay(historicalFees)

  return {
    dailyVolume: volItem?.vol,
    dailyFees: feeItem?.fees,
    dailyUserFees: feeItem?.fees,
    dailyRevenue: "0",
    dailyProtocolRevenue: "0",
    dailySupplySideRevenue: feeItem?.fees,
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
};

export default adapter;
