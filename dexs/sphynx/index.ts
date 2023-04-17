import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/sphynxswap/exchange",
  // [CHAIN.CRONOS]: "https://crnode.thesphynx.co/graph/subgraphs/name/exchange/cronos",
  [CHAIN.BITGERT]: "https://brgraph.thesphynx.co/subgraphs/name/exchange/brise"
}, {
  factoriesName: "sphynxFactories",
  dayData: "sphynxDayData"
});

export default adapters;
