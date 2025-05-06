import { Adapter, DISABLED_ADAPTER_KEY } from "../adapters/types";
import fetchURL from "../utils/fetchURL";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import disabledAdapter from "../helpers/disabledAdapter";

const yieldPool = "https://api.valasfinance.com/api/dailyFees";

interface IFees {
  timestamp: number;
  added: number;
};

const graphs = () => {
  return (_: CHAIN) => {
    return async (timestamp: number) => {
      const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
      const historicalVolume: IFees[] = (await fetchURL(yieldPool))?.data.dailyFees;
      const totalFees = historicalVolume
      .filter((volItem: IFees) => volItem.timestamp <= dayTimestamp)
      .reduce((acc, { added }) => acc + Number(added), 0)

      const dailyFees = historicalVolume
        .find((dayItem:IFees) => dayItem.timestamp === dayTimestamp)?.added ?? 0

      const totalRevenue = totalFees * .5;
      const dailyRevenue = dailyFees * .5;
      return {
        timestamp,
        totalFees,
        dailyFees,
        totalRevenue: totalRevenue,
        dailyRevenue,
      };
    };
  }
};


const adapter: Adapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [CHAIN.BSC]: {
        fetch: graphs()(CHAIN.BSC),
        start: '2022-03-20',
    },
  },
}

export default adapter;
