import { Chain, FetchOptions } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpointsClassic = {
  [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/glyph/glyph-tvl"
};

const VOLUME_FIELD = "totalVolumeUSD";

//0.3 swap fee, 6/10 to lp, 4/10 to treasury
const feesPercent = {
  type: "volume" as "volume",
  Fees: 0.3,
  UserFees: 0.3,
  Revenue: 0.12,
  ProtocolRevenue: 0.12,
  SupplySideRevenue: 0.18
}

const graphsClassic = getGraphDimensions2({
  graphUrls: endpointsClassic,
  totalVolume: {
    factory: "glyphFactories",
    field: VOLUME_FIELD,
  },
  totalFees: {
    factory: "glyphFactories",
    field: VOLUME_FIELD,
  },
  feesPercent
});

const fetch = async (options: FetchOptions) => {
  const res = await graphsClassic(options);
  res['dailyFees'] = res['dailyUserFees']
  return res;
}

const classic = Object.keys(endpointsClassic).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch,
      start: '2024-03-19',
    },
  }),
  {}
) as any;

export default {
  version: 2,
  adapter: classic,
  methodology: {
    Fees: "GlyphExchange charges a flat 0.3% fee",
    UserFees: "Users pay a 0.3% fee on each trade",
    Revenue: "A 0.12% of each trade goes to treasury",
    ProtocolRevenue: "Treasury receives a share of the fees",
    SupplySideRevenue: "Liquidity providers get 6/10 of all trades in their pools"
  }
}
