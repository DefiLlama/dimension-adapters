import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    [CHAIN.SYSCOIN]: "https://graph.pegasys.finance/subgraphs/name/pollum-io/pegasys"
}, {
    factoriesName: "pegasysFactories",
    dayData: "pegasysDayData",
});
