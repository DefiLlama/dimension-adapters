import { Adapter, FetchResultFees, FetchOptions } from "../../adapters/types";
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

const fetch = async (options: FetchOptions): Promise<FetchResultFees> => {
  const resp: Responce = await httpGet(`${url}?timestamp=${options.toTimestamp}`);
  const data = resp.chains[options.chain];
  if (!data || !data.daily || !data.total) {
    return {} as FetchResultFees;
  }
  return {
    dailyFees: data.daily.revenue,
    dailyRevenue: data.daily.revenue,
  };
};

const adapter: Adapter = {
  fetch,
  chains,
  start: '2023-09-04',
  deadFrom: "2026-01-16",
  methodology: {
    Fees: "Fees paid by users for trading and bridging.",
    Revenue: "All fees are revenue.",
  }
};

export default adapter;
