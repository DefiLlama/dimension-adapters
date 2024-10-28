import { FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";


interface IData {
  volume: number
  date: string
}

const fetchVolume = async (_: any, _t: any, options: FetchOptions) => {
  const merged = require('./merged.json') as IData[];
  const date = new Date(options.startOfDay * 1000).toLocaleDateString()
  const dailyVolume = merged.filter(e => e.date === date)
    .reduce((acc, cur) => acc + cur?.volume || 0, 0)
  return {
    dailyVolume: dailyVolume,
    timestamp: options.startOfDay,
  }
}


const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.TEZOS]: {
      fetch: fetchVolume,
      start: 0
    }
  }
}

export default adapter;
