import { Chain } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";
import { SimpleAdapter } from "../../adapters/types";

const endpointsV3 = {
  [CHAIN.FLARE]:
    "https://api.goldsky.com/api/public/project_cm1tgcbwdqg8b01un9jf4a64o/subgraphs/sparkdex-v3-2/latest/gn",
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
  [CHAIN.FLARE]: 1719878400,
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
  methodology: {
    Fees: "Each pool charge between 0.01% to 1% fee",
    UserFees: "Users pay between 0.01% to 1% fee",
    Revenue: "0 to 1/4 of the fee goes to treasury",
    HoldersRevenue: "None",
    ProtocolRevenue: "Treasury receives a share of the fees",
    SupplySideRevenue:
      "Liquidity providers get most of the fees of all trades in their pools",
  },
  version: 2,
  adapter: v3
};

export default adapter;

