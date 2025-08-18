import { Adapter, FetchResultFees } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { httpGet } from "../../utils/fetchURL";

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
    async (timestamp: number): Promise<FetchResultFees> => {
      const resp: Responce = await httpGet(`${url}?timestamp=${timestamp}`);
      const data = resp.chains[chain];
      if (!data || !data.daily || !data.total) {
        return {} as FetchResultFees;
      }
      return {
        dailyFees: data.daily.revenue,
        dailyRevenue: data.daily.revenue,
        totalFees: data.total.revenue,
        totalRevenue: data.total.revenue,
        timestamp
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
  methodology: {
    Fees: "Fees paid by users for trading and bridging.",
    Revenue: "All fees are revenue.",
  }
};

export default adapter;
