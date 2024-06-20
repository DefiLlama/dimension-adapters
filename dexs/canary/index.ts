import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    "avax": sdk.graph.modifyEndpoint('An3x5Mz4YXEERomXYC4AhGgNhRthPFXNYDnrMCjrAJe')
}, {
    factoriesName: "canaryFactories",
    dayData: "canaryDayData",
});