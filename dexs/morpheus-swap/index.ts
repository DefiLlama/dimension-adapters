import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.FANTOM]: "https://api.thegraph.com/subgraphs/name/daedboi/morpheus-swap"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData",
  gasToken: "coingecko:fantom"
});

adapters.adapter.fantom.start = 1636106400;
export default adapters;
