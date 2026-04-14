import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (_timestamp: number, _: any, options: FetchOptions): Promise<any> => {
  const dailyVolume = options.createBalances();
  const dailyFees = options.createBalances();
  const dailyRevenue = options.createBalances();
  
  const { stats: { v3 } } = await httpGet('https://sei-api.dragonswap.app/api/v1/stats');
  const dateData = v3.daily_data.find((i: any) => i.created_at === options.startOfDay);
  if (!dateData) throw Error(`no data found for date ${new Date(options.startOfDay * 1000).toISOString()}`);
  
  dailyVolume.addUSDValue(dateData.volume_usd);
  dailyFees.addUSDValue(dateData.fees_usd);
  dailyRevenue.addUSDValue(Number(dateData.fees_usd) * 0.25);
  
  return {
    dailyVolume,
    dailyFees,
    dailyRevenue,
  }
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.SEI]: {
      fetch,
      start: '2024-05-28',
    },
  }
}

export default adapter;
