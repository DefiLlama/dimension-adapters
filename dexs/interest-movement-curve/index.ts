import fetchURL from '../../utils/fetchURL';
import { FetchResultV2, SimpleAdapter } from '../../adapters/types';
import { CHAIN } from '../../helpers/chains';

const url: any = {
  [CHAIN.MOVE]: `https://api.interestlabs.io/v1/movement/mainnet/curve/metrics`,
};

interface Summary {
  tvl: string;
  apr: string;
  fees: string;
  fees1D: string;
  fees7D: string;
  fees30D: string;
  volume: string;
  volume1D: string;
  volume7D: string;
  volume30D: string;
  revenue: string;
  revenue1D: string;
  revenue7D: string;
  revenue30D: string;
}

interface PoolData {
  coins: string[];
  poolId: string;
  symbols: [string, string];
  isStable: boolean;
  metrics: Summary;
}

interface Metrics {
  total: number;
  totalPages: number;
  summary: Summary;
  data: PoolData[];
}

async function fetch(
  _: any,
  _1: any,
  { endTimestamp, chain }
): Promise<FetchResultV2> {
  const metrics: Metrics = await fetchURL(
    `${url[chain]}?timestamp=${endTimestamp}&limit=200`
  );

  return {
    dailyVolume: metrics.summary.volume1D,
    dailyFees: metrics.summary.fees1D,
    dailyRevenue: metrics.summary.revenue1D,
  };
}

const adapter: SimpleAdapter = {
  adapter: {
    [CHAIN.MOVE]: {
      fetch,
      runAtCurrTime: true,
      start: '2025-03-03',
    },
  },
};

export default adapter;
