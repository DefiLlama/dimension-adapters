import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";


const fetch = async () => {

  const dailyData:any = await fetchURL('https://base-api.sharpe.ai/api/dailySharpeDexVolume')
  
  return {
      dailyVolume: dailyData?.dailyVolume
  };
};


const adapter: SimpleAdapter = {
  version: 2,
  // base-api.sharpe.ai no longer resolves; API reported zero volume since 2025-04-13.
  deadFrom: '2025-04-13',
  adapter: {
    [CHAIN.ETHEREUM]: {
      fetch,
      runAtCurrTime: true,
      start: '2024-04-01',
    },
  },
};

export default adapter;
