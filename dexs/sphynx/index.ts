import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: sdk.graph.modifyEndpoint('C4bw9Bt2Ewbx1pB6uYwduNXpWQAc4HRSayc6KeNy2n1b'),
  // [CHAIN.CRONOS]: "https://crnode.thesphynx.co/graph/subgraphs/name/exchange/cronos",
  [CHAIN.BITGERT]: "https://brgraph.thesphynx.co/subgraphs/name/exchange/brise"
}, {
  factoriesName: "sphynxFactories",
  dayData: "sphynxDayData"
});

export default adapters;
