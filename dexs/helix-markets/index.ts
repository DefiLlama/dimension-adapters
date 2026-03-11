
import { FetchOptions, FetchResultV2, FetchV2, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";


const URL = "https://dgw.helixic.io/api/v1/ticker";
interface IVolume {
  quoteVolume: string;
}


const fetch: FetchV2 = async (_: FetchOptions): Promise<FetchResultV2> => {
  const quoteVolume: IVolume[] = (await httpGet(URL));
  const dailyVolume = quoteVolume.reduce((e: number, a: IVolume) => parseFloat(a.quoteVolume) + e, 0);
  return {
    dailyVolume: dailyVolume
  }
}

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
      [CHAIN.ICP]: {
        fetch: fetch,
        start: '2024-04-23',
        runAtCurrTime: true,
      }
    }
}
export default adapter;
