import { Chain } from "@defillama/sdk/build/general";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions } from "../../helpers/getUniSubgraph";
import { BreakdownAdapter } from "../../adapters/types";

const endpointsV3 = {
  [CHAIN.PLANQ]: "https://subgraph.planq.finance/subgraphs/name/ianlapham/uniswap-v3",
};

const v3Graphs = getGraphDimensions({
  graphUrls: endpointsV3,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  dailyVolume: {
    factory: "uniswapDayData",
    field: "volumeUSD",
  },
  feesPercent: {
    type: "fees",
    ProtocolRevenue: 14.2857, //  1/7th of generated LP fees are protocol fees
    HoldersRevenue: 0,
    UserFees: 100, // User fees are 100% of collected fees
    SupplySideRevenue: 85.7143, // ~85% of fees are going to LPs
    Revenue: 100, // Revenue is 100% of collected fees
  },
});

const startTimeV3: { [key: string]: number } = {
  [CHAIN.PLANQ]: 1716372437,
};

const v3 = Object.keys(endpointsV3).reduce(
  (acc, chain) => ({
    ...acc,
    [chain]: {
      fetch: v3Graphs(chain as Chain),
      start: startTimeV3[chain],
      meta: {
        methodology: {
          Fees: "Each pool charge between 0.01% to 1% fee",
          UserFees: "Users pay between 0.01% to 1% fee",
          Revenue: "0 to 1/4 of the fee goes to Physica Token stakers",
          HoldersRevenue: "None",
          ProtocolRevenue: "Physica token stakers receive a share of the fees",
          SupplySideRevenue:
            "Liquidity providers get most of the fees of all trades in their pools",
        },
      },
    },
  }),
  {}
);

const adapter: BreakdownAdapter = {
  breakdown: {
    v3: v3,
  },
};

export default adapter;
