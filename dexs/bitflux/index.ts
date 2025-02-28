import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.CORE]: "https://thegraph.coredao.org/subgraphs/name/bitflux"
};


const graphs = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "tradeVolumes",
    field: "volume",
  },
  feesPercent: {
    type: "volume",
    UserFees: 50,          // 0.05% = 50 basis points
    ProtocolRevenue: 25,   // 0.025% = 25 basis points
    SupplySideRevenue: 25, // 0.025% = 25 basis points
    HoldersRevenue: 0,    
    Revenue: 25,           // 0.025% = 25 basis points
    Fees: 50,             // 0.05% = 50 basis points
  },
});

const methodology = {
  UserFees: "User pays a 0.05% fee on each swap.",
  Fees: "A 0.05% of each swap is collected as trading fees",
  Revenue: "Protocol receives 0.025% of the swap fee (50% of total fees)",
  ProtocolRevenue: "Protocol receives 0.025% of the swap fee (50% of total fees)",
  SupplySideRevenue: "0.025% of the swap fee is distributed to LPs (50% of total fees)",
  HoldersRevenue: "No direct revenue to token holders",
};

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.CORE]: {
      fetch: graphs(CHAIN.CORE),
      start: '2024-11-06',
      meta: {
        methodology,
      },
    },
  },
};

export default adapter;
