
import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const fetchFees = async (options: FetchOptions) => {
  const data = require('./data.json');
  const dateStr = new Date(options.startOfDay * 1000).toISOString().split('T')[0];
  const daily = data.find(e => e.day.split(' ')[0] === dateStr);
  const dailyVolume = options.createBalances();
  dailyVolume.addUSDValue(daily.total_volume_usd);
  return {
    dailyVolume: dailyVolume
  }
}

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.POLYGON]: {
      fetch: fetchFees,
      start: 1601424000,
    }
  }
}

export default adapters
