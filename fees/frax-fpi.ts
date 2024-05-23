import { Adapter, FetchResultFees } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import { getTimestampAtStartOfNextDayUTC } from "../utils/date";
import { httpGet } from "../utils/fetchURL";

const endpoint = (year: number, month: number) => `https://api.frax.finance/v2/fpifpis/income-expense/detail?year=${year}&month=${month}`;
interface IFPI {
  timestampSec: number;
  type: string;
  chain: string;
  amountUsd: string;
  category: string;
}
const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date((timestamp * 1000)))
  const yesterdaysTimestamp = getTimestampAtStartOfNextDayUTC(timestamp) - 1;
  const date = new Date((timestamp * 1000));
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const response: IFPI[]  = (await httpGet(endpoint(year, month)))?.details;
  const historical = response.filter((e:IFPI) => e.chain === 'ethereum');
  const dailyData = historical
    .filter((p: IFPI) => p.timestampSec >= dayTimestamp)
    .filter((p: IFPI) => p.timestampSec <= yesterdaysTimestamp)
  const dailyFees = dailyData.filter((p: IFPI) =>  p.type === 'income')
    .reduce((a: number, b: IFPI) => a + Number(b.amountUsd), 0);
  const dailyExpens = dailyData.filter((p: IFPI) =>  p.type === 'expense')
    .reduce((a: number, b: IFPI) => a + Number(b.amountUsd), 0);
  const dailyRevenue = dailyFees - dailyExpens;
  return {
    timestamp: dayTimestamp,
    dailyFees: dailyFees.toString(),
    dailyProtocolRevenue: dailyRevenue.toString(),
    dailyRevenue: dailyRevenue.toString(),
  } as FetchResultFees;
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch: fetch,
      start: 1653955200
    },
  }
}

export default adapter;
