import * as sdk from "@defillama/sdk";
import { CHAIN } from "../../helpers/chains";
import { univ2Adapter2 } from "../../helpers/getUniSubgraphVolume";

const adapters = univ2Adapter2({
  [CHAIN.MOONBEAM]: sdk.graph.modifyEndpoint('HgSAfZvHEDbAVuZciPUYEqFzhAUnjJWmyix5C1R2tmTp')
}, {});
adapters.adapter.moonbeam.start = 1641960253;
export default adapters;
