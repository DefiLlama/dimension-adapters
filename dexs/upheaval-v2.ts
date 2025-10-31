
import { CHAIN } from '../helpers/chains'
import { getGraphDimensions2 } from '../helpers/getUniSubgraph'

const methodology = {
  ProtocolRevenue: 'Protocol gets 16% of the swap fees.',
  SupplySideRevenue: 'LPs get 84% of the swap fees.',
  HoldersRevenue: 'Holders have no revenue.',
};
const graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.HYPERLIQUID]: 'https://api.upheaval.fi/subgraphs/name/upheaval/exchange-v2',
  },
  totalVolume: {
    factory: 'pancakeFactories',
  },
  feesPercent: {
    type: "volume" as const,
    Fees: 0.3,
    UserFees: 0.3,
    ProtocolRevenue: 0.16 * 0.3,
    HoldersRevenue: 0,
    SupplySideRevenue: 0.84 * 0.3, // 84% of fees are going to LPs
    Revenue: 0.16 * 0.3, // Revenue is 16% of collected fees
  },
})
export default {
  version: 2,
  methodology,
  chains: [CHAIN.HYPERLIQUID],
  fetch: graphs,
  start: '2025-07-26'
}