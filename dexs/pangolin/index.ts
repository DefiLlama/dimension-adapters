import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    "avax": sdk.graph.modifyEndpoint('CPXTDcwh6tVP88QvFWW7pdvZJsCN4hSnfMmYeF1sxCLq')
}, {
    factoriesName: "pangolinFactories",
    dayData: "pangolinDayData",
});
