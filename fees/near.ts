import axios from "axios";
import { FetchResultFees, ProtocolType, SimpleAdapter } from "../adapters/types";
import { CHAIN } from "../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../helpers/getUniSubgraphVolume";
import fetchURL from "../utils/fetchURL";
interface IChart {
  date: string;
  txn_fee_usd: string;
}
const fetchFees =  async (timestamp: number): Promise<FetchResultFees> => {
  const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const url  = 'https://api.nearblocks.io/v1/charts'
  const value: IChart[] = (await axios.get(url, { headers: {
    'origin': 'https://nearblocks.io' } })).data.charts;
  const dateStr = new Date(todayTimestamp * 1000).toISOString().split('T')[0];
  const dailyFees = value.find((item) => item.date.split('T')[0] === dateStr)?.txn_fee_usd;
  return {
    timestamp,
    dailyFees: dailyFees ? `${dailyFees}` : undefined,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    near: {
      fetch: fetchFees,
      start: async () => 0
    }
  },
  protocolType: ProtocolType.CHAIN
}
export default adapter;
