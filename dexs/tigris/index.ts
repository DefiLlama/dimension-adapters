import { Adapter, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async (_: any, _1: any, { dateString }: FetchOptions) => {
  const { data: { volumes } } = await httpGet('https://subgraph.tigris.trade/api/platform')
  const volData = volumes.find((e: any) => e.date === dateString)
  if (!volData) throw new Error('No data found for the given date');

  return {
    dailyVolume: volData.volumeUSDFormatted,
  };
}

const adapter: Adapter = {
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch,
      start: '2022-09-13',
    },
    // [CHAIN.POLYGON]: {
    //   fetch: fetch(CHAIN.POLYGON),
    //   start: '2022-09-13',
    // }
  }
}

export default adapter;
