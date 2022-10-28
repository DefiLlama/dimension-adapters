import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    [CHAIN.HECO]: "https://api2.makiswap.com/subgraphs/name/maki-mainnet/exchange"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});
