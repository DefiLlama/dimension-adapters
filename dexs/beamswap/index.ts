import { BreakdownAdapter, ChainEndpoints } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";
import { getUniV2LogAdapter } from "../../helpers/uniswap";

const v1graphs = getGraphDimensions2({
  graphUrls: {
    [CHAIN.MOONBEAM]:
      "https://graph.beamswap.io/subgraphs/name/beamswap/beamswap-stableamm",
  },
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  feesPercent: {
    type: "volume",
    UserFees: 0.04,
    ProtocolRevenue: 0.02,
    SupplySideRevenue: 0.02,
    HoldersRevenue: 0,
    Revenue: 0.02,
    Fees: 0.04,
  },
});

const adapter: BreakdownAdapter = {
  version: 2,
  breakdown: {
    classic: {
      [CHAIN.MOONBEAM]: {
        fetch: getUniV2LogAdapter({ factory: '0x985BcA32293A7A496300a48081947321177a86FD', revenueRatio: 0.13/0.30, protocolRevenueRatio: 0.13/0.30, }),
      },
    },
    "stable-amm": {
      [CHAIN.MOONBEAM]: {
        fetch: v1graphs,
        start: '2022-07-04',
      },
    },
  },
};

export default adapter;
