// Reservoir Swap service is no longer available.
// GraphQL endpoints return 503 errors. Support has been handed over to Protofire.
// The white-labeled products (Sakura Swap, Whitelabel) should be tracked separately.
// See issue: https://github.com/DefiLlama/dimension-adapters/issues/5063

import { FetchOptions, SimpleAdapter } from '../adapters/types';
import { CHAIN } from '../helpers/chains';
import { getGraphDimensions2 } from '../helpers/getUniSubgraph';

const v2Endpoints: { [s: string]: string } = {
  [CHAIN.INK]:
    'https://graph-node.reservoir.tools/subgraphs/name/ink/v2-subgraph',
  [CHAIN.ZERO]:
    'https://graph-node.reservoir.tools/subgraphs/name/zero/v2-subgraph',
  [CHAIN.SHAPE]:
    'https://graph-node.reservoir.tools/subgraphs/name/shape/v2-subgraph',
  [CHAIN.ABSTRACT]:
    'https://graph-node.reservoir.tools/subgraphs/name/abstract/v2-subgraph',
};

const v2Graph = getGraphDimensions2({
  graphUrls: v2Endpoints,
  totalFees: {
    factory: 'uniswapFactories',
    field: 'totalVolumeUSD',
  },
  feesPercent: {
    type: 'volume',
    UserFees: 0.3,
    ProtocolRevenue: 0,
    SupplySideRevenue: 0.3,
    HoldersRevenue: 0,
    Revenue: 0,
    Fees: 0.3,
  },
});

const fetch = async (options: FetchOptions) => {
  const res = await v2Graph(options);
  res['dailyFees'] = res['dailyUserFees'];
  return res;
};

const adapter: SimpleAdapter = {
  version: 2,
  deadFrom: '2025-12-14',
  adapter: {
    [CHAIN.INK]: {
      fetch,
      start: '2025-01-07',
    },
    [CHAIN.ZERO]: {
      fetch,
      start: '2025-01-07',
    },
    [CHAIN.SHAPE]: {
      fetch,
      start: '2025-01-07',
    },
    [CHAIN.ABSTRACT]: {
      fetch,
      start: '2025-01-07',
    },
  },
};

export default adapter;
