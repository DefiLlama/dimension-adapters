import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    "avax": "https://api.thegraph.com/subgraphs/name/pangolindex/exchange"
}, {
    factoriesName: "pangolinFactories",
    dayData: "pangolinDayData",
});
