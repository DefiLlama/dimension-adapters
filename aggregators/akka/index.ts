import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";

const URL = 'https://routerv2.akka.finance';

interface IAPIResponse {
  dailyVolume: string;
}

const chainIds = {
  [CHAIN.CORE]: 1116,
  [CHAIN.XDC]: 50,
  [CHAIN.BITLAYER]: 200901,
  [CHAIN.BSQUARED]: 223,
};

const startTimestamps = {
  [CHAIN.CORE]: '2024-06-01',
  [CHAIN.XDC]: '2024-10-29',
  [CHAIN.BITLAYER]: '2024-10-29',
  [CHAIN.BSQUARED]: '2024-10-29',
};

const fetch = async (_a: any, _b: any, options: FetchOptions): Promise<FetchResult> => {
  const chainId = chainIds[options.chain];

  const endpoint = `/v2/${chainId}/statistics/dappradar`;
  const response = await fetchURL(`${URL}${endpoint}`);

  const { dailyVolume }: IAPIResponse = response;

  return {
    dailyVolume
  };
};

const adapter: SimpleAdapter = {
  version: 1,
  adapter: Object.keys(chainIds).reduce((acc, chain) => {
    const startTimestamp = startTimestamps[chain];
    return {
      ...acc,
      [chain]: {
        fetch,
        runAtCurrTime: true,
        start: startTimestamp,
      },
    };
  }, {}),
};

export default adapter;