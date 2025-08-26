import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";
import { BreakdownAdapter, SimpleAdapter } from "../../adapters/types";

const endpointsV3 = {
  [CHAIN.KAVA]:
    "https://kava-graph-node.metavault.trade/subgraphs/name/kinetixfi/v3-subgraph",
  // [CHAIN.BASE]:
  //   "https://api.studio.thegraph.com/query/55804/kinetixfi-base-v3/version/latest",
};

const v3Graphs = getGraphDimensions2({
  graphUrls: endpointsV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 100, // 100% of fees are going to LPs
    Revenue: 0, // Set revenue to 0 as protocol fee is not set for all pools for now
  },
});

const startTimeV3: { [key: string]: number } = {
  [CHAIN.KAVA]: 1693267200,
  [CHAIN.BASE]: 1715126400,
};

const v3 = Object.keys(endpointsV3).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: v3Graphs,
      start: startTimeV3[chain],
    },
  }),
  {}
);

const adapter: SimpleAdapter = {
  version: 2,
  adapter: v3,
  methodology: {
    Fees: "Each pool charge between 0.01% to 1% fee",
    UserFees: "Users pay between 0.01% to 1% fee",
    Revenue: "0 to 1/4 of the fee goes to treasury",
    HoldersRevenue: "None",
    ProtocolRevenue: "Treasury receives a share of the fees",
    SupplySideRevenue:
      "Liquidity providers get most of the fees of all trades in their pools",
  },
};

export default adapter;
