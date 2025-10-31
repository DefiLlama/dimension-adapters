import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpointsClassic = {
  [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/glyph/algebra",
};

const VOLUME_FIELD = "totalVolumeUSD";
const FEES_FIELD = "totalFeesUSD";

const graphsClassic = getGraphDimensions2({
  graphUrls: endpointsClassic,
  totalVolume: {
    factory: "factories",
    field: VOLUME_FIELD,
  },
  totalFees: {
    factory: "factories",
    field: FEES_FIELD,
  },
  //dynamic fee
  feesPercent: {
    type: "fees",
    Fees: 100,
    UserFees: 100,
    Revenue: 15,
    ProtocolRevenue: 15,
    SupplySideRevenue: 85,
  },
});

const classic = Object.keys(endpointsClassic).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: graphsClassic,
      start: '2024-03-19',
    },
  }),
  {},
) as any;

export default {
  version: 2,
  adapter: classic,
  methodology: {
    Fees: "GlyphExchange-v4 charges a dynamic fee",
    UserFees: "GlyphExchange-v4 charges a dynamic fee",
    Revenue: "15% fees goes to treasury",
    ProtocolRevenue: "Treasury receives a share of the fees",
    SupplySideRevenue: "85% fees goes to liquidity providers",
  },
};