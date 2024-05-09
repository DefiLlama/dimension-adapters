import { FetchResultFees, ProtocolType, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet } from "../../utils/fetchURL";
interface IChart {
  date: string;
  txn_fee_usd: string;
}
const fetchFees =  async (timestamp: number): Promise<FetchResultFees> => {
  const todayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const url  = 'https://api.nearblocks.io/v1/charts'
  const value: IChart[] = (await httpGet(url, {
    headers: {
    'origin': 'https://nearblocks.io',
    'referer': 'https://nearblocks.io/charts' ,
    'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36'
  }})).charts;
  // const value: IChart[] = require('./near.json');

  const dateStr = new Date(todayTimestamp * 1000).toISOString().split('T')[0];
  const dailyFees = value.find((item) => item.date.split('T')[0] === dateStr)?.txn_fee_usd;
  return {
    timestamp,
    dailyFees: dailyFees ? `${dailyFees}` : undefined,
    dailyRevenue: dailyFees ? `${dailyFees}` : undefined,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.NEAR]: {
      fetch: fetchFees,
      start: 1595289600
    }
  },
  protocolType: ProtocolType.CHAIN
}
export default adapter;
