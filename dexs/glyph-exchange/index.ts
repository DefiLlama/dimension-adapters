import { BreakdownAdapter } from "../../adapters/types";
import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { getStartTimestamp } from "../../helpers/getStartTimestamp";

const endpointsClassic = {
  [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/glyph/glyph-tvl"
};

const VOLUME_FIELD = "totalVolumeUSD";
const DEFAULT_DAILY_VOLUME_FIELD = "dailyVolumeUSD";

//0.3 swap fee, 6/10 to lp, 4/10 to treasury
const feesPercent = {
  type: "volume" as "volume",
  Fees: 0.3,
  UserFees: 0.3,
  Revenue: 0.12,
  ProtocolRevenue: 0.12,
  SupplySideRevenue: 0.18
}

const graphsClassic = getGraphDimensions({
  graphUrls: endpointsClassic,
  totalVolume: {
    factory: "glyphFactories",
    field: VOLUME_FIELD,
  },
  dailyVolume: {
    factory: "glyphDayData",
    field: DEFAULT_DAILY_VOLUME_FIELD,
  },
  feesPercent
});

const startTimeQueryClassic = {
  endpoints: endpointsClassic,
  dailyDataField: "glyphDayData",
};

const classic = Object.keys(endpointsClassic).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: graphsClassic(chain as Chain),
      start: getStartTimestamp({ ...startTimeQueryClassic, chain }),
      meta: {
        methodology: {
          Fees: "GlyphExchange charges a flat 0.3% fee",
          UserFees: "Users pay a 0.3% fee on each trade",
          Revenue: "A 0.12% of each trade goes to treasury",
          ProtocolRevenue: "Treasury receives a share of the fees",
          SupplySideRevenue: "Liquidity providers get 6/10 of all trades in their pools"
        }
      }
    },
  }),
  {}
) as any;

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    classic: classic,
  }
}

export default adapter
