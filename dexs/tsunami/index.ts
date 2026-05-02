import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const SUBGRAPH =
  "https://api.goldsky.com/api/public/project_cmm7vh5xwsa8m01qmdr7w7u62/subgraphs/tsunami-v3/2.4.0/gn";

const graphs = getGraphDimensions2({
  graphUrls: { [CHAIN.INK]: SUBGRAPH },
  totalVolume: { factory: "factories", field: "totalVolumeUSD" },
  totalFees: { factory: "factories", field: "totalFeesUSD" },
  feesPercent: {
    type: "fees",
    UserFees: 100,
    SupplySideRevenue: 100,
    Revenue: 0,
    ProtocolRevenue: 0,
    HoldersRevenue: 0,
  },
});

const adapter: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.INK]: {
      fetch: graphs,
      start: "2026-03-14",
    },
  },
  methodology: {
    Volume:
      "Sum of swap volumes across all Tsunami V3 pools, computed from Factory.totalVolumeUSD deltas in the Tsunami V3 subgraph.",
    Fees:
      "Sum of swap fees across all Tsunami V3 pools (Factory.totalFeesUSD deltas).",
    UserFees:
      "100% of swap fees go to LPs — Tsunami V3 has no protocol-fee switch enabled.",
    SupplySideRevenue: "Equal to UserFees.",
    Revenue: "0 — no protocol fee.",
    ProtocolRevenue: "0 — no protocol fee.",
  },
};

export default adapter;
