
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { queryDune } from "../../helpers/dune";

const fetchFees = async (timestamp: number, _t: any, options: FetchOptions) => {
  const data: any[] = await queryDune("4172945")
  const dateStr = new Date(timestamp * 1000).toISOString().split('T')[0];
  const daily = data.find(e => e.day.split(' ')[0] === dateStr);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(daily.total_volume_usd);
  return {
    timestamp: timestamp,
    dailyVolume: dailyVolume
  }
}

const adapters: SimpleAdapter = {
  version: 1,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: 1601424000,
    }
  },
  isExpensiveAdapter: true,
}

export default adapters
