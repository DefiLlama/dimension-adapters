import { SimpleAdapter } from "../../adapters/types";
import { CHAIN } from "../../helpers/chains";
import { getGraphDimensions2 } from "../../helpers/getUniSubgraph";

const endpoints = {
  // [CHAIN.ERA]: "https://gateway.thegraph.com/api/88ec88f205b57dce13befebc60ef5e0c/subgraphs/id/BeYacqRmNFgoNgPwqmD9CNzcH3Hqqy5WeQHhi3khQHPu"
  [CHAIN.ERA]: "https://api.studio.thegraph.com/query/49271/zf-exchange-v3-version-2/v0.1.8"
}

const graph = getGraphDimensions2({
  graphUrls: endpoints,
  totalVolume: {
    factory: "factories",
  },
  totalFees: {
    factory: "factories",
  },
  feesPercent: {
    type: "fees",
    Revenue: 33
  }
});

const adapters: SimpleAdapter = {
  version: 2,
  adapter: {
    [CHAIN.ERA]: {
      fetch: graph(CHAIN.ERA),
      start: '2024-11-18',
      meta: {
        methodology: {
          Fees: "A trading fee, depending on the fee tier of the CL pool, is collected.",
          UserFees: "Users pay a percentage of the volume, which equal to the pool fee tier, for each swap.",
          Revenue: "Approximately 33% of the fees go to the protocol.",
          ProtocolRevenue: "Approximately 33% of the fees go to the protocol.",
          SupplySideRevenue: "Approximately 67% of the fees are distributed to liquidity providers (ZFLP token holders)."
        }
      }
    }
  }
}
export default adapters;
