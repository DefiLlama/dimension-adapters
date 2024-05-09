import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
  [CHAIN.BSC]: "https://graph-bsc-mainnet.babydoge.com/subgraphs/name/babydoge/exchange"
}, {
  factoriesName: "babyDogeFactories",
  dayData: "factoryDayData",
});

adapters.adapter.bsc.start = 1661780137;
export default adapters;
