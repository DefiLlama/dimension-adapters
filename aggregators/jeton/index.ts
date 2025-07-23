import { Adapter, FetchResultVolume } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import fetchURL from "../../utils/fetchURL";

const url = "https://api.echooo.xyz/tenant/defillama/data/v2";

const chains = [
  CHAIN.ETHEREUM,
  CHAIN.POLYGON,
  CHAIN.OPTIMISM,
  CHAIN.BSC,
  CHAIN.ARBITRUM,
  CHAIN.AVAX,
  CHAIN.SCROLL,
  CHAIN.ERA,
  CHAIN.BASE,
];
type Responce = {
  timestamp: number;
  protocol: {
    daily: {
      revenue: string;
      volume: string;
    };
    total: {
      revenue: string;
      volume: string;
    };
  };
  chains: {
    [chain: string]: {
      daily: {
        revenue: string;
        volume: string;
      };
      total: {
        revenue: string;
        volume: string;
      };
    };
  };
};

const fetch =
  (chain: string) =>
  async (timestamp: number): Promise<FetchResultVolume> => {
    const resp: Responce = await fetchURL(`${url}?timestamp=${timestamp}`);
    const data = resp.chains[chain];
    if (!data || !data.daily || !data.total) {
      return {} as FetchResultVolume;
    }
    return {
      dailyVolume: data.daily.volume,
    };
  };

const adapter: Adapter = {
  adapter: {
    ...Object.entries(chains).reduce((acc, chain) => {
      const key = chain[1];
      return {
        ...acc,
        [key]: {
          fetch: fetch(key),
          start: '2023-09-04',
        },
      };
    }, {}),
  },
};

export default adapter;
