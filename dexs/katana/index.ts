import { CHAIN } from "../../helpers/chains";
import { SimpleAdapter } from "../../adapters/types";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

/*
use axiedao.org proxy, because public endpoint
https://thegraph-v2.roninchain.com/subgraphs/name/axieinfinity/katana-subgraph-blue
blocks requests from the DefiLlama server
*/
const fetch = univ2Adapter2({
  endpoints: {
    [CHAIN.RONIN]: "https://defillama.axiedao.org/graphql/katana"
  },
  factoriesName: "katanaFactories",
  totalVolume: "totalVolumeUSD",
  feeConfig: {
    totalFees: 0.003,
    protocolFees: 0.0005,
    supplySideRevenue: 0.0025,
    revenue: 0.0005,
    userFees: 0.003,
  }
})

const adapter: SimpleAdapter = {
  version: 2,
  fetch,
  chains: [CHAIN.RONIN],
  start: '2021-11-01'
}

export default adapter;
