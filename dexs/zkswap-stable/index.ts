import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpoints = {
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/49271/zf-exchange-stableswap-3/v0.1.1"
}

const graph = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
  },
  feesPercent: {
    type: "volume",
    Fees: 0.01,
    Revenue: 0.0033
  }
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      fetch: graph(CHAIN.ERA),
      start: '2024-11-06',
      meta: {
        methodology: {
          UserFees: "User pays 0.01% fees on each swap.",
          ProtocolRevenue: "Approximately 33% of the fees go to the protocol.",
          SupplySideRevenue: "Approximately 67% of the fees are distributed to liquidity providers (ZFLP token holders)",
          Revenue: "Approximately 33% of the fees go to the protocol.",
        }
      }
    }
  }
}
export default adapters;