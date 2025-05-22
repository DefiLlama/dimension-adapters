const { CHAIN } = require("../../helpers/chains");
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

/*
use axiedao.org proxy, because public endpoint
https://thegraph-v2.roninchain.com/subgraphs/name/axieinfinity/katana-subgraph-blue
blocks requests from the DefiLlama server
*/
const adpters = univ2Adapter2({
  [CHAIN.RONIN]: "https://defillama.axiedao.org/graphql/katana"
}, {
  factoriesName: "katanaFactories",
  dayData: "katanaDayData",
});

adpters.adapter[CHAIN.RONIN].start = 1635724800;
export default adpters;
