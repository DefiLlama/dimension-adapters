import { FetchOptions, FetchResult, } from "../../adapters/types";
import { queryDune } from "../../helpers/dune";
let _data: any = {}

const fetch = async ({ startOfDay }: FetchOptions): Promise<FetchResult> => {
  if (!_data[startOfDay]) _data[startOfDay] = queryDune(`3835933`, {})
  const [chainData] = await _data[startOfDay]
  if (!chainData) throw new Error(`Dune query failed`)
  return {
    dailyVolume: chainData["Volume 24h"],
  };
};

const adapter: any = {
  timetravel: false,
  version: 2,
  adapter: {
    "aptos": {
      fetch: fetch,
      runAtCurrTime: true,
      start: '2023-06-16',
    }
  },
  isExpensiveAdapter: true,
};

export default adapter;
