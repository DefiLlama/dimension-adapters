import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { DEFAULT_DAILY_VOLUME_FACTORY, DEFAULT_TOTAL_VOLUME_FIELD, getGraphDimensions } from "../../helpers/getUniSubgraph";

const endpointV3 = {
  [CHAIN.ARBITRUM]: 'https://subgraph-prod.goerli.horiza.io/subgraphs/name/retro-arbitrum-one-uniswap-v3'
}
const VOLUME_USD = 'volumeUSD'
const v3Graphs = getGraphDimensions({
  graphUrls: endpointV3,
  totalVolume: {
    factory: "factories",
    field: DEFAULT_TOTAL_VOLUME_FIELD,
  },
  dailyVolume: {
    factory: DEFAULT_DAILY_VOLUME_FACTORY,
    field: VOLUME_USD,
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 10,
    HoldersRevenue: 0,
    UserFees: 100,
    SupplySideRevenue: 90,
    Revenue: 10,
  }
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ARBITRUM]: {
      fetch: v3Graphs(CHAIN.ARBITRUM),
      start: 1704585600,
    }
  }
}
export default adapters;
