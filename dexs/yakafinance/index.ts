import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter({
    [CHAIN.SEI]: "https://api.studio.thegraph.com/query/82132/yaka-finance/version/latest"
}, {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
});


adapters.adapter.sei.start = 1719432193;
export default adapters;