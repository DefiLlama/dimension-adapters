import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet, httpPost } from "../../utils/fetchURL";


type FutureContracts = {
  id: number;
  symbol: string,
  volume24h: string | null,
  low24h: string | null,
  high24h: string | null
}

interface Response {
  future_contracts: FutureContracts[];
  timestamp: string
}

const fetch = async (timestamp: number) => {
  const response: Response = (await httpGet("https://data-api.hibachi.xyz/exchange/stats/volumes"));
  
  const dailyVolume = response.future_contracts.reduce((acc, item) => {
    return acc + Number(item.volume24h ?? 0);
  }, 0);

  const output = {
    dailyVolume: dailyVolume?.toString(),
    timestamp: new Date(response.timestamp).getTime() / 1000,
  }


  return output
};

const adapter: SimpleAdapter = {
  adapter: {
    "hibachi": {
      fetch,
      start: '2025-03-01',
    },
  }
};

export default adapter;
