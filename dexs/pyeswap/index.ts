import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapter = univ2Adapter({
    [CHAIN.BSC]: "https://api.thegraph.com/subgraphs/name/officialdevteamsix/pyeswap"
}, {
    factoriesName: "pyeFactories",
    dayData: "pyeDayData",
});
adapter.adapter.bsc.start = 1660893036;
export default adapter;
