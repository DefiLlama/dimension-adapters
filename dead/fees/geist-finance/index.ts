import { Adapter } from "../../adapters/types";
import fetchURL from "../../utils/fetchURL";
import { CHAIN } from "../../helpers/chains"
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const yieldPool = "https://api.geist.finance/api/dailyFees";

interface IFees {
  timestamp: number;
  added: number;
};

const fetch = async (timestamp: number, _a:any, _b:any) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const historicalVolume: IFees[] = (await fetchURL(yieldPool))?.data.dailyFees;

  const dailyFees = historicalVolume
    .find((dayItem:IFees) => dayItem.timestamp === dayTimestamp)?.added

  const dailyRevenue = dailyFees && dailyFees * .5;

  return {
    dailyFees,
    dailyRevenue,
  };
};


const adapter: Adapter = {
  deadFrom: "2023-12-14",
  version: 1,
  adapter: {
    [CHAIN.FANTOM]: {
        fetch,
        start: '2021-10-06',
    },
  },
}

export default adapter;
