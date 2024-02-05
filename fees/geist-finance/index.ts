import { Adapter, DISABLED_ADAPTER_KEY } from "../../adapters/types";
import { FANTOM } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains"
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import disabledAdapter from "../../helpers/disabledAdapter";

const yieldPool = "https://api.geist.finance/api/dailyFees";

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
        .find((dayItem:IFees) => dayItem.timestamp === dayTimestamp)?.added

      const totalRevenue = totalFees * .5;
      const dailyRevenue = dailyFees && dailyFees * .5;
      return {
        timestamp,
        totalFees: totalFees.toString(),
        dailyFees: dailyFees?.toString(),
        totalRevenue: totalRevenue.toString(),
        dailyRevenue: dailyRevenue ? dailyRevenue.toString() : "0",
      };
    };
  }
};


const adapter: Adapter = {
  adapter: {
    [DISABLED_ADAPTER_KEY]: disabledAdapter,
    [FANTOM]: {
        fetch: graphs()(CHAIN.FANTOM),
        start: 1633478400,
    },
  },
}

export default adapter;
