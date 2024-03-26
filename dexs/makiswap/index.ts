import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
    [CHAIN.HECO]: "https://api2.makiswap.com/subgraphs/name/maki-mainnet/exchange"
}, {
  factoriesName: "pancakeFactories",
  dayData: "pancakeDayData"
});

adapter.adapter[CHAIN.HECO].start = 1630000000;
adapter.adapter[CHAIN.HECO].fetch = async (timestamp: number) => { return { timestamp}};
export default adapter;
