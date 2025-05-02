import fetchURL from "../../utils/fetchURL";
import { FetchOptions, FetchResult, SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";

const URL = 'https://routerv2.akka.finance';

interface IAPIResponse {
  dailyVolume: string;
  totalVolume: string;
}

const chainIds = {
  [CHAIN.CORE]: 1116,
  [CHAIN.XDC]: 50,
  [CHAIN.BITLAYER]: 200901,
  [CHAIN.BSQUARED]: 223,
};

const startTimestamps = {
  [CHAIN.CORE]: 1717200000,// 6/1/2024
  [CHAIN.XDC]: 1730160000,// 29/10/2024
  [CHAIN.BITLAYER]: 1730160000,// 29/10/2024
  [CHAIN.BSQUARED]: 1730160000,// 29/10/2024
};

const fetch = async (timestamp: number, _: any, { chain }: FetchOptions): Promise<FetchResult> => {
  const dayTimestamp = getUniqStartOfTodayTimestamp(new Date(timestamp * 1000));
  const chainId = chainIds[chain];

  const endpoint = `/v2/${ chainId }/statistics/dappradar`;
  const response = await fetchURL(`${ URL }${ endpoint }`);

  const { dailyVolume, totalVolume }: IAPIResponse = response;

  return {
    dailyVolume,
    totalVolume,
    timestamp: dayTimestamp,
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