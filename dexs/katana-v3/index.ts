const { CHAIN } = require("../../helpers/chains");
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

/*
use axiedao.org proxy, because public endpoint
https://thegraph-v2.roninchain.com/subgraphs/name/axieinfinity/katana-v3
blocks requests from the DefiLlama server
*/

const adpters = univ2Adapter2({
  [CHAIN.RONIN]: "https://thegraph-v2.roninchain.com/subgraphs/name/axieinfinity/katana-v3"
}, {
  factoriesName: "factories",
  dayData: "PoolDayData",
});

adpters.adapter[CHAIN.RONIN].start = 1732603221;
export default adpters;
