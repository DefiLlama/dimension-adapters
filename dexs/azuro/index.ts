import { CHAIN } from "../../helpers/chains";
import { getUniqStartOfTodayTimestamp } from "../../helpers/getUniSubgraphVolume";
import type { FetchOptions } from "../../adapters/types";
import { httpGet } from "../../utils/fetchURL";

type TChain = {
    [key: string]: string;
  };

const CHAINS: TChain = {
  [CHAIN.POLYGON]: "polygon",
  [CHAIN.XDAI]: "gnosis",
  [CHAIN.ARBITRUM]: "arbitrum"
};

const URL = 'https://api.azuro.org/volumes/'

const fetch = async (options: FetchOptions) => {
  const unixTimestamp = getUniqStartOfTodayTimestamp(new Date(options.endTimestamp * 1000));
  const { data } = await httpGet(URL, {
    params: {
      blockchain: options.chain,
      endTime: unixTimestamp
    }
  });

  if (!data) {
    return {
      dailyVolume: '0',
      totalVolume: '0',
      timestamp: unixTimestamp,
    };
  }

  return {
    dailyVolume: data[0].daily_volume ?? '0',
    totalVolume: data[0].total_volume,
    timestamp: unixTimestamp,
  };
  
};

const adapter: any = {
    version: 2,
    adapter: {
      ...Object.values(CHAINS).reduce((acc, chain) => {
        return {
          ...acc,
          [chain]: {
            fetch: fetch,
            start: 1717372800,
          },
        };
      }, {}),
    },
  };

export default adapter;
