import { CHAIN } from '../helpers/chains'
import { getGraphDimensions2 } from '../helpers/getUniSubgraph'

const methodology = {
  Fees: "0.25% trading fees on all trades.",
  ProtocolRevenue: 'Protocol gets 16% of the swap fees.',
  SupplySideRevenue: '0.17% of the swap volume',
  HoldersRevenue: 'All the revenue go to the vePOT holders.',
};
const graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.XLAYER]: "https://indexer.potatoswap.finance/subgraphs/id/Qmaeqine8JeSiKV3QCi6JJqzDGryF7D8HCJdqcYxW7nekw",
  },
  totalVolume: {
    factory: 'pancakeFactories',
  },
  feesPercent: {
    type: "volume" as const,
    Fees: 0.25,
    UserFees: 0.25,
    ProtocolRevenue: 0,
    HoldersRevenue: 0.08,
    SupplySideRevenue: 0.17,
    Revenue: 0.08
  },
})
export default {
  version: 2,
  methodology,
  chains: [CHAIN.XLAYER],
  fetch: graphs,
  start: '2024-04-23'
}