import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpoints: Record<string, string> = {
  [CHAIN.FLARE]: "https://api.goldsky.com/api/public/project_cmbnjfb9bfd3001tj08r4hq5c/subgraphs/flareswap/1.0.0/gn",
};

const fetch = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
    field: "totalVolumeUSD",
  },
  feesPercent: {
    type: "fees",
    UserFees: 100,
    SupplySideRevenue: 100,
    Revenue: 0,
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
  },
});


const methodology = {
  Fees: "Each pool charges between 0.01% and 1% per swap.",
  UserFees: "Traders pay the pool's swap fee on every transaction.",
  Revenue: "The protocol treasury currently does not retain any portion of fees.",
  ProtocolRevenue: "0% of fees are sent to the treasury.",
  HoldersRevenue: "Token holders do not earn fees directly.",
  SupplySideRevenue: "100% of fees are distributed to LPs proportional to their liquidity.",
};

const adapter: SimpleAdapter = {
  version: 2,
  methodology,
  adapter: {
    [CHAIN.FLARE]: {
      fetch,
      start: '2025-07-01',
    }
  },
};

export default adapter;
