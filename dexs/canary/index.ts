import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    "avax": "https://api.thegraph.com/subgraphs/name/canarydeveloper/canarydex"
}, {
    factoriesName: "canaryFactories",
    dayData: "canaryDayData",
});