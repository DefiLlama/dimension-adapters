import { ChainBlocks, FetchOptions, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import { getPrices } from "../../utils/prices";
import fetchURL from "../../utils/fetchURL";


const fetch = async () => {

  const data:any = await fetchURL('https://base-api.sharpe.ai/api/dexVolume')
  const dailyData:any = await fetchURL('https://base-api.sharpe.ai/api/dailySharpeDexVolume')
  
  return {
      totalVolume: data?.totalVolume,
      dailyVolume: dailyData?.dailyVolume
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      start: '2024-04-01',
    },
  },
};

export default adapter;
