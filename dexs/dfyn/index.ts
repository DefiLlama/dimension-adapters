import * as sdk from "@defillama/sdk";
import { univ2Adapter } from "../../helpers/getUniSubgraphVolume";
import { CHAIN } from "../../helpers/chains";

// Not complete! Missing older versions
export default univ2Adapter({
    [CHAIN.POLYGON]: sdk.graph.modifyEndpoint('Dizc6HBJZWB276wcyycYMxN8FMKeKb7RpSvwu83F4gTc'),
}, {});