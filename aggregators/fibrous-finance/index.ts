import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const chainConfig: Record<string, { id: number, start: string }> = {
  [CHAIN.BASE]: { id: 8453, start: '2025-04-04' },
  [CHAIN.HYPERLIQUID]: { id: 999, start: '2025-09-08' },
  [CHAIN.STARKNET]: {id:23448594291968336, start: '2024-03-02'},
  [CHAIN.CITREA]: {id:4114, start: '2026-01-27'},
  [CHAIN.MONAD]: {id:143, start: '2025-11-26'}

};

const URL = "https://graph.fibrous.finance/volume/daily";

interface IAPIResponse {
  status: number;
  data: {
    dailyVolume: string;
  };
  message: string;
}

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const response: IAPIResponse = await fetchURL(URL + `?chainId=${chainConfig[options.chain].id}`);
  const dailyVolume = response.data.dailyVolume;
  return {
    dailyVolume: dailyVolume,
  };
};

const adapter = {
  adapter: chainConfig,
  fetch,
  runAtCurrTime: true,
  version: 1,
};

export default adapter;
