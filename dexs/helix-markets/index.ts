import { ChainBlocks, FetchOptions, FetchResultVolume, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import {  httpGet } from "../../utils/fetchURL"

const URL = "https://dgw.helixic.io/api/v1/ticker";
interface IVolume {
  quoteVolume: string;
}

const fetch = async (timestamp: number, _chainBlocks: ChainBlocks, _options: FetchOptions): Promise<FetchResultVolume> => {
    const quoteVolume: IVolume[] = (await httpGet(URL));
    const dailyVolume = quoteVolume.reduce((e: number, a: IVolume) => parseFloat(a.quoteVolume) + e, 0);

  return {
    dailyVolume: dailyVolume,
    timestamp
  }
}

const adapter: SimpleAdapter = {
  adapter: {
      [CHAIN.ICP]: {
        fetch: fetch,
        start: 1713830400,
      }
    }
}
export default adapter;
