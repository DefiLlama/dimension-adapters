import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";

export default univ2Adapter({
    [CHAIN.BSC]: sdk.graph.modifyEndpoint('2D9rXpMTvAgofWngsyRE17jKr5ywrU4W3Eaa71579qkd')
}, {
    factoriesName: "pancakeFactories",
    dayData: "pancakeDayData",
});
