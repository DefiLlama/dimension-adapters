import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

const fetch = async () => {
  const totalVolume = (await httpGet(`https://api.dipcoin.io/api/index/stats/line`))?.data?.[0]?.volume

  return {
    dailyVolume: totalVolume,
  };
};


const adapter: SimpleAdapter = {
    adapter:{
        [CHAIN.SUI]:{
            fetch: fetch,
            runAtCurrTime: true
        }
    }
};

export default adapter;
