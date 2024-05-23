import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/wigoswap/exchange2"
}, {
  factoriesName: "wigoswapFactories",
  dayData: "wigoDayData",
  gasToken: "coingecko:fantom"
});

adapters.adapter.fantom.start = 1642982400;
export default adapters;
