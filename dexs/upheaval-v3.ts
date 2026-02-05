
import { CHAIN } from '../helpers/chains'
import { getGraphDimensions2 } from '../helpers/getUniSubgraph'

const methodology = {
  ProtocolRevenue: 'Protocol gets 16% of the swap fees.',
  SupplySideRevenue: 'LPs get 84% of the swap fees.',
  HoldersRevenue: 'Holders have no revenue.',
};
const graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.HYPERLIQUID]: 'https://api.upheaval.fi/subgraphs/name/upheaval/exchange-v3-fixed',
  },
  totalVolume: {
    factory: 'factories',
  },
  feesPercent: {
    type: 'fees',
    ProtocolRevenue: 16,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 84, // 84% of fees are going to LPs
    Revenue: 16, // Revenue is 16% of collected fees
  },
})
export default {
  version: 2,
  methodology,
  chains: [CHAIN.HYPERLIQUID],
  fetch: graphs,
  start: '2025-08-06'
}