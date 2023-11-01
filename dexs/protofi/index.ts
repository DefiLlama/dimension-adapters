import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/theothercrypto/protofi-dex-fantom",
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
  gasToken : "coingecko:fantom"
});
