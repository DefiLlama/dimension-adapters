
import { CHAIN } from '../helpers/chains'
import { getGraphDimensions2 } from '../helpers/getUniSubgraph'

const methodology = {
  ProtocolRevenue: 'Protocol have no revenue.',
  SupplySideRevenue: 'All user fees are distributed among LPs.',
  HoldersRevenue: 'Holders have no revenue.',
};
const graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.HYDRAGON]: 'https://subgraph.hydrachain.org/subgraphs/name/v3-subgraph',
  },
  totalVolume: {
    factory: 'factories',
  },
  feesPercent: {
    type: 'fees',
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0, // Revenue is 100% of collected fees
  },
})
export default {
  version: 2,
  methodology,
  chains: [CHAIN.HYDRAGON],
  fetch: graphs,
  start: '2025-05-20', // Start date for the adapter
}