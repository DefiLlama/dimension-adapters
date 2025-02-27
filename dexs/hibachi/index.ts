import type { SimpleAdapter } from "../../adapters/types";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { httpGet, httpPost } from "../../utils/fetchURL";


type FutureContracts = {
  id: number;
  underlying_symbol: string,
  name: string,
  symbol: string,
  volume24h: string | null,
  low24h: string | null,
  high24h: string | null
}

interface Response {
  future_contracts: FutureContracts[];

}

const fetch = async (timestamp: number) => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const response: Response = (await httpGet("https://data-api.hibachi.xyz/exchange/stats/volumes"));

  const dailyVolume = response.future_contracts.reduce((acc, item) => {
    return acc + Number(item.volume24h ?? 0);
  }, 0);

  const output = {
    dailyVolume: dailyVolume?.toString(),
    timestamp: dayTimestamp,
  }


  return output
};

const adapter: SimpleAdapter = {
  adapter: {
    "hibachi": {
      fetch,
      start: '2025-02-17',
    },
  }
};

export default adapter;
